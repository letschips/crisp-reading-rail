import { Notice, Plugin, PluginSettingTab, Setting } from "obsidian";
import {
  ReadingRailAudio,
  createReadingRailAudioEnvironment,
} from "./audio-feedback";
import {
  ORB_STYLE_OPTIONS,
  normalizeOrbStyle,
  type OrbStyleSetting,
} from "./orb-styles";
import { ReadingPaneRegistry } from "./pane-registry";
import {
  DEFAULT_SETTINGS,
  normalizeSettings,
  rewriteReadingMemoryMapPaths,
  rewriteWaypointMapPaths,
  updateReadingMemoryMap,
  updateWaypointMap,
  type CrispReadingRailSettings,
} from "./settings";
import type { ReadingMemory, ReadingWaypoint } from "./types";
import { createAboutCard, createSettingGroup } from "./settings-ui";
import {
  clearLicenseVerificationCache,
  verifyLicenseCode,
} from "./license";
import {
  READING_RAIL_SOUND_STYLE_OPTIONS,
  normalizeSoundStyle,
} from "./sound-styles";
import {
  normalizeOutlineMaxLevel,
  normalizeOutlineScope,
} from "./outline-preferences";

interface CompanionPluginRegistry {
  plugins?: {
    plugins?: Record<string, {
      settings?: {
        soundStyle?: unknown;
      };
    }>;
  };
}

const CYCLE_ORB_STYLES: readonly OrbStyleSetting[] = [
  "followFileExplorer",
  "default",
  "soccer",
  "basketball",
  "tennis",
  "clown",
  "pikachu",
  "gear",
];

export default class CrispReadingRailPlugin extends Plugin {
  settings: CrispReadingRailSettings = {
    ...DEFAULT_SETTINGS,
    waypoints: {},
  };
  private registry: ReadingPaneRegistry | null = null;
  private audio: ReadingRailAudio | null = null;
  private reconcileFrame: number | null = null;
  private saveQueue: Promise<void> = Promise.resolve();
  private unloaded = false;

  async onload(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
    const window = this.app.workspace.containerEl.ownerDocument.defaultView;
    if (window) {
      this.audio = new ReadingRailAudio(
        () => this.settings.soundEnabled,
        createReadingRailAudioEnvironment(window),
        {
          getStyle: () => this.settings.soundStyle,
          getCompanionStyle: () => this.getCompanionSoundStyle(),
          isReleaseEnabled: () => this.settings.releaseSoundEnabled,
        },
      );
    }
    this.addSettingTab(new CrispReadingRailSettingTab(this));
    this.addCommand({
      id: "toggle-navigation-sound",
      name: "Toggle navigation sound",
      callback: async () => {
        this.settings.soundEnabled = !this.settings.soundEnabled;
        await this.saveSettings();
        new Notice(
          `Crisp Reading Rail sound ${
            this.settings.soundEnabled ? "enabled" : "muted"
          }`,
        );
      },
    });
    this.addCommand({
      id: "jump-to-last-reading-position",
      name: "Jump to last reading position",
      callback: () => this.registry?.jumpToLastReadingPosition(),
    });
    this.addCommand({
      id: "toggle-pinned-outline",
      name: "Toggle pinned outline",
      callback: () => this.registry?.togglePinnedOutline(),
    });
    this.addCommand({
      id: "jump-to-next-heading",
      name: "Jump to next heading",
      callback: () => this.registry?.jumpNextHeading(),
    });
    this.addCommand({
      id: "jump-to-previous-heading",
      name: "Jump to previous heading",
      callback: () => this.registry?.jumpPreviousHeading(),
    });
    this.addCommand({
      id: "cycle-orb-style",
      name: "Cycle orb style",
      callback: async () => {
        const current = CYCLE_ORB_STYLES.indexOf(this.settings.orbStyle);
        const nextStyle = CYCLE_ORB_STYLES[
          (current + 1) % CYCLE_ORB_STYLES.length
        ];
        if (nextStyle !== "soccer") {
          const check = await verifyLicenseCode(
            this.settings.licenseCode,
            "crisp-reading-rail",
          );
          if (!check.valid) {
            new Notice(
              "🔒 切换其它小球属于 Crisp 激活用户专属功能（未激活仅可使用默认足球）",
            );
            this.settings.orbStyle = "soccer";
            await this.saveSettings();
            return;
          }
        }
        this.settings.orbStyle = nextStyle;
        await this.saveSettings();
        new Notice(`Orb style set to: ${this.settings.orbStyle}`);
      },
    });
    this.app.workspace.onLayoutReady(() => {
      if (this.unloaded) {
        return;
      }
      this.registry = new ReadingPaneRegistry(this.app, {
        appearance: {
          getOrbStyle: () => this.settings.orbStyle,
          getAssetUrl: (path) => this.getAssetUrl(path),
        },
        sound: this.audio ?? undefined,
        waypoints: {
          get: (filePath) => this.settings.waypoints[filePath] ?? [],
          set: (filePath, waypoints) => this.updateWaypoints(filePath, waypoints),
        },
        readingMemory: {
          get: (filePath) => this.settings.readingMemory[filePath] ?? null,
          set: (filePath, memory) => this.updateReadingMemory(filePath, memory),
        },
        outlinePreferences: () => ({
          enabled: true,
          maxLevel: this.settings.outlineMaxLevel,
          scope: this.settings.outlineScope,
        }),
      });
      this.registry.reconcile();

      const scheduleReconcile = (): void => this.scheduleReconcile();
      this.registerEvent(this.app.workspace.on("layout-change", scheduleReconcile));
      this.registerEvent(this.app.workspace.on("active-leaf-change", scheduleReconcile));
      this.registerEvent(this.app.workspace.on("file-open", scheduleReconcile));
      this.registerEvent(this.app.workspace.on("window-open", scheduleReconcile));
      this.registerEvent(this.app.workspace.on("window-close", scheduleReconcile));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        this.rewriteStoredPaths(oldPath, file.path);
      }));
      this.registerEvent(this.app.vault.on("delete", (file) => {
        this.rewriteStoredPaths(file.path, null);
      }));
      this.registerEvent(this.app.metadataCache.on("changed", (file) => {
        this.registry?.refreshFile(file);
      }));
    });
  }

  onunload(): void {
    this.unloaded = true;
    const window = this.app.workspace.containerEl.ownerDocument.defaultView;
    if (this.reconcileFrame !== null && window) {
      window.cancelAnimationFrame(this.reconcileFrame);
      this.reconcileFrame = null;
    }
    this.registry?.destroy();
    this.registry = null;
    const audio = this.audio;
    this.audio = null;
    if (audio) {
      void audio.destroy().catch((error) => {
        console.debug("Crisp Reading Rail audio cleanup failed", error);
      });
    }
  }

  async saveSettings(): Promise<void> {
    await this.persistSettings();
    this.registry?.refreshAppearance();
    this.registry?.refreshAll();
  }

  private scheduleReconcile(): void {
    if (this.unloaded || this.reconcileFrame !== null) {
      return;
    }
    const window = this.app.workspace.containerEl.ownerDocument.defaultView;
    if (!window) {
      return;
    }
    this.reconcileFrame = window.requestAnimationFrame(() => {
      this.reconcileFrame = null;
      if (!this.unloaded) {
        this.registry?.reconcile();
      }
    });
  }

  private getAssetUrl(path: string): string {
    const pluginDirectory = this.manifest.dir
      ?? `.obsidian/plugins/${this.manifest.id}`;
    return this.app.vault.adapter.getResourcePath(`${pluginDirectory}/${path}`);
  }

  private updateWaypoints(
    filePath: string,
    waypoints: readonly ReadingWaypoint[],
  ): void {
    this.settings.waypoints = updateWaypointMap(
      this.settings.waypoints,
      filePath,
      waypoints,
    );
    void this.persistSettings().catch((error) => {
      console.debug("Crisp Reading Rail waypoint save failed", error);
    });
  }

  private updateReadingMemory(filePath: string, memory: ReadingMemory): void {
    this.settings.readingMemory = updateReadingMemoryMap(
      this.settings.readingMemory,
      filePath,
      memory,
    );
    void this.persistSettings().catch((error) => {
      console.debug("Crisp Reading Rail reading-memory save failed", error);
    });
  }

  private rewriteStoredPaths(oldPath: string, newPath: string | null): void {
    const previousWaypoints = this.settings.waypoints;
    const previousMemory = this.settings.readingMemory;
    const nextWaypoints = rewriteWaypointMapPaths(previousWaypoints, oldPath, newPath);
    const nextMemory = rewriteReadingMemoryMapPaths(previousMemory, oldPath, newPath);
    if (
      JSON.stringify(nextWaypoints) === JSON.stringify(previousWaypoints)
      && JSON.stringify(nextMemory) === JSON.stringify(previousMemory)
    ) {
      return;
    }
    this.settings.waypoints = nextWaypoints;
    this.settings.readingMemory = nextMemory;
    void this.persistSettings().catch((error) => {
      console.debug("Crisp Reading Rail stored path save failed", error);
    });
  }

  private persistSettings(): Promise<void> {
    const snapshot = JSON.parse(JSON.stringify(
      this.settings,
    )) as CrispReadingRailSettings;
    const operation = this.saveQueue.then(() => this.saveData(snapshot));
    this.saveQueue = operation.catch((error) => {
      console.debug("Crisp Reading Rail settings save failed", error);
    });
    return operation;
  }

  private getCompanionSoundStyle(): unknown {
    const app = this.app as typeof this.app & CompanionPluginRegistry;
    return app.plugins?.plugins?.["crisp-file-explorer"]?.settings?.soundStyle;
  }
}

class CrispReadingRailSettingTab extends PluginSettingTab {
  private readonly plugin: CrispReadingRailPlugin;

  constructor(plugin: CrispReadingRailPlugin) {
    super(plugin.app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    const licenseGroup = createSettingGroup(
      containerEl,
      "软件授权",
      "本地 Ed25519 签名验证，并联网校验设备数量；离线时自动降级为本地验证。",
      true,
    );

    const statusSetting = new Setting(licenseGroup)
      .setName("当前激活状态")
      .setDesc("正在验证授权状态...");

    if (this.plugin.settings.licenseCode) {
      void verifyLicenseCode(this.plugin.settings.licenseCode, "crisp-reading-rail").then((verifyRes) => {
        if (verifyRes.valid && verifyRes.payload) {
          statusSetting.setDesc(
            `✅ 已激活（授权给: ${verifyRes.payload.userName}，到期时间: ${verifyRes.payload.expiresAt.split("T")[0]}）`,
          );
        } else {
          statusSetting.setDesc(
            `❌ 未激活（${verifyRes.reason || "授权码无效"}）`,
          );
        }
      });
    } else {
      statusSetting.setDesc("❌ 未激活（仅可使用默认足球小球，激活可解锁全套 3D 小球）");
    }

    new Setting(licenseGroup)
      .setName("输入授权码")
      .setDesc("激活时会向 Crisp 授权服务发送授权码、设备标识和插件 ID；结果在当前会话缓存 15 分钟。")
      .addText((text) => text
        .setPlaceholder("粘贴 Crisp 授权码...")
        .setValue(this.plugin.settings.licenseCode)
        .onChange(async (value) => {
          clearLicenseVerificationCache();
          this.plugin.settings.licenseCode = value.trim();
          await this.plugin.saveSettings();
        }))
      .addButton((button) => button
        .setButtonText("激活 / 重新验证")
        .setCta()
        .onClick(async () => {
          clearLicenseVerificationCache();
          const result = await verifyLicenseCode(this.plugin.settings.licenseCode, "crisp-reading-rail");
          if (result.valid && result.payload) {
            new Notice(`🎉 Crisp Reading Rail 激活成功！欢迎使用，${result.payload.userName}`);
            this.display();
          } else {
            new Notice(`❌ 激活失败: ${result.reason}`);
          }
        }));

    const visualBody = createSettingGroup(
      containerEl,
      "小球与视觉外观",
      "阅读位置小球样式与联动追踪规则。",
      true,
    );

    new Setting(visualBody)
      .setName("小球样式")
      .setDesc("选择阅读位置小球的样式。")
      .addDropdown((dropdown) => {
        for (const option of ORB_STYLE_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.orbStyle)
          .onChange(async (value) => {
            const selectedStyle = normalizeOrbStyle(value);
            if (selectedStyle !== "soccer") {
              const check = await verifyLicenseCode(this.plugin.settings.licenseCode, "crisp-reading-rail");
              if (!check.valid) {
                new Notice("🔒 切换其它小球属于 Crisp 激活用户专属功能（未激活仅可使用默认足球）");
                this.plugin.settings.orbStyle = "soccer";
                await this.plugin.saveSettings();
                this.display();
                return;
              }
            }
            this.plugin.settings.orbStyle = selectedStyle;
            await this.plugin.saveSettings();
          });
      });

    const audioBody = createSettingGroup(
      containerEl,
      "音效与触感反馈",
      "拖动或导航阅读轨道时播放轻柔反馈。",
      true,
    );

    new Setting(audioBody)
      .setName("导航音效")
      .setDesc(
        "只在直接使用阅读轨道时播放轻柔反馈；正常阅读保持静音。",
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.soundEnabled)
          .onChange(async (value) => {
            this.plugin.settings.soundEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    new Setting(audioBody)
      .setName("音效风格")
      .setDesc(
        "选择安静的音色组合，或跟随 Crisp File Explorer 当前的音效风格。",
      )
      .addDropdown((dropdown) => {
        for (const option of READING_RAIL_SOUND_STYLE_OPTIONS) {
          dropdown.addOption(option.value, option.label);
        }
        dropdown
          .setValue(this.plugin.settings.soundStyle)
          .onChange(async (value) => {
            this.plugin.settings.soundStyle = normalizeSoundStyle(value);
            await this.plugin.saveSettings();
          });
      });

    new Setting(audioBody)
      .setName("落定音效")
      .setDesc(
        "标题跳转或拖动结束后播放轻柔确认音。",
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.releaseSoundEnabled)
          .onChange(async (value) => {
            this.plugin.settings.releaseSoundEnabled = value;
            await this.plugin.saveSettings();
          });
      });

    const outlineBody = createSettingGroup(
      containerEl,
      "大纲与阅读轨道交互",
      "标题导航、阅读书签与键盘操作。",
      false,
    );
    new Setting(outlineBody)
      .setName("标题层级")
      .setDesc("选择轨道与展开大纲显示到哪一级标题。")
      .addDropdown((dropdown) => dropdown
        .addOption("2", "仅 H2")
        .addOption("3", "H2–H3")
        .addOption("4", "H2–H4")
        .setValue(String(this.plugin.settings.outlineMaxLevel))
        .onChange(async (value) => {
          this.plugin.settings.outlineMaxLevel = normalizeOutlineMaxLevel(value);
          await this.plugin.saveSettings();
        }));

    new Setting(outlineBody)
      .setName("展开范围")
      .setDesc("显示全部标题，或只展开当前 H2 章节及其子标题；刻度仍保留全文位置。")
      .addDropdown((dropdown) => dropdown
        .addOption("all", "全部标题")
        .addOption("currentH2", "当前 H2 分支")
        .setValue(this.plugin.settings.outlineScope)
        .onChange(async (value) => {
          this.plugin.settings.outlineScope = normalizeOutlineScope(value);
          await this.plugin.saveSettings();
        }));
    const description = outlineBody.ownerDocument.createElement("p");
    description.className = "setting-item-description";
    description.textContent = [
      "轨道索引阅读视图中的 H2–H4 标题。",
      "双击轨道，或聚焦轨道后按 M，可为当前笔记保存阅读书签。",
      "右键书签（或聚焦后按 Delete）可删除。",
      "按 P 固定/释放展开大纲，Esc 释放并收起，J/K 跳到下一个/上一个标题。",
    ].join("");
    outlineBody.append(description);

    createAboutCard(
      containerEl,
      "Crisp Reading Rail",
      "用阅读轨道、位置提示与快捷导航，让长文阅读始终知道自己在哪里。",
    );
  }
}

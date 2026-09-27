// Run against installed plugins in a running Obsidian vault; opens and closes a blank popout.
// Usage: node scripts/companion-runtime.e2e.mjs "Vault name" /absolute/report.json
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import process from "node:process";
const code = String.raw`(async () => {
  const rr = app.plugins.plugins['crisp-reading-rail'];
  const fe = app.plugins.plugins['crisp-file-explorer'];
  const previousLeaf = app.workspace.activeLeaf;
  const readingLeaf = app.workspace.getLeavesOfType('markdown')[0];
  if (!readingLeaf) throw new Error('Open a Markdown Reading view before running this probe');
  const readingPath = readingLeaf.view.getState().file;
  const priorStat = fe.settings.activity.fileStats[readingPath];
  const savedStat = priorStat ? {...priorStat} : undefined;
  await readingLeaf.loadIfDeferred();
  app.workspace.setActiveLeaf(readingLeaf, {focus:false});
  rr.registry.reconcile();
  const record = [...rr.registry.controllers.values()].find(r => r.controller.view);
  if (!record) throw new Error('Switch a Markdown leaf to Reading view before running this probe');
  const saved = { rrOrb: rr.settings.orbStyle, rrSound: rr.settings.soundStyle, feOrb: fe.settings.orbStyle, feSound: fe.settings.soundStyle, enabled:rr.settings.soundEnabled, release:rr.settings.releaseSoundEnabled, lastTick:rr.audio.lastTickAt };
  const results = [];
  const check = (name, actual, expected) => results.push({name,actual,expected,pass:actual === expected});
  const flush = () => new Promise(resolve => setTimeout(resolve, 40));
  const popout = app.workspace.openPopoutLeaf({width:600,height:650});
  for (let i=0; i<100 && popout.view.containerEl.ownerDocument === document; i++) await flush();
  const doc = popout.view.containerEl.ownerDocument;
  if (doc === document) { popout.detach(); throw new Error('Popout did not acquire its own document'); }
  const ownerWindow = doc.defaultView;
  const host = doc.createElement('div');
  host.style.cssText = 'position:relative;width:500px;height:500px';
  popout.view.containerEl.append(host);
  let view;
  try {
    rr.settings.orbStyle = 'followFileExplorer';
    rr.settings.soundStyle = 'followFileExplorer';
    fe.settings.orbStyle = 'gear';
    fe.updateOrbStyles();
    view = new record.controller.view.constructor(host, {onHeadingSelect(){},onProgressSelect(){}}, {appearance: rr.registry.appearance});
    const style = () => host.querySelector('.crisp-reading-rail__orb')?.dataset.orbStyle;
    check('secondary-window follows main-window orb', style(), 'gear');
    fe.settings.orbStyle = 'character5'; fe.updateOrbStyles(); await flush();
    check('secondary-window live style update', style(), 'character5');
    const local = doc.createElement('div'); local.className = 'crisp-fe-orb'; local.dataset.orbStyle = 'tennis'; doc.body.append(local); await flush();
    check('local companion takes precedence', style(), 'tennis');
    local.remove(); await flush();
    check('local companion removal resumes main-window style', style(), 'character5');
    fe.settings.soundStyle = 'matchOrb';
    check('match-orb character sound', rr.audio.resolveStyle(ownerWindow), 'bubble');
    fe.settings.orbStyle = 'gear'; fe.updateOrbStyles(); await flush();
    check('match-orb gear sound', rr.audio.resolveStyle(ownerWindow), 'mechanical');
    fe.settings.soundStyle = 'retro8bit';
    check('explicit companion sound', rr.audio.resolveStyle(ownerWindow), 'retro8bit');
    fe.settings.soundStyle = 'matchOrb';
    local.dataset.orbStyle = 'character5'; doc.body.append(local); await flush();
    rr.settings.soundEnabled = true; rr.settings.releaseSoundEnabled = true;
    const tones = [];
    const play = rr.audio.play;
    rr.audio.play = (tone, window) => tones.push({tone, correctWindow:window === ownerWindow});
    try {
      rr.audio.lastTickAt = -Infinity;
      rr.audio.tick(0.5, ownerWindow); rr.audio.settle(ownerWindow);
      check('tick uses local-window matched tone', tones[0]?.tone.start, 350);
      check('settle uses local-window matched tone', tones[1]?.tone.start, 280);
      check('audio preserves window ownership', tones.length === 2 && tones.every(t=>t.correctWindow), true);
    } finally { rr.audio.play = play; local.remove(); }
    rr.settings.soundStyle = 'wooden';
    check('independent Reading Rail sound', rr.audio.resolveStyle(ownerWindow), 'wooden');
    view.destroy();
    fe.settings.orbStyle = 'character1'; fe.updateOrbStyles(); await flush();
    check('destroy removes secondary rail', host.querySelector('.crisp-reading-rail') === null, true);
  } finally {
    view?.destroy(); host.remove(); popout.detach();
    rr.settings.orbStyle = saved.rrOrb; rr.settings.soundStyle = saved.rrSound;
    rr.settings.soundEnabled = saved.enabled; rr.settings.releaseSoundEnabled = saved.release; rr.audio.lastTickAt = saved.lastTick;
    fe.settings.orbStyle = saved.feOrb; fe.settings.soundStyle = saved.feSound;
    fe.updateOrbStyles(); rr.refreshAppearance();
    if (previousLeaf) app.workspace.setActiveLeaf(previousLeaf, {focus:false});
    if (savedStat && readingPath) {
      fe.settings.activity.fileStats[readingPath] = savedStat;
      await fe.saveSettings();
    }
  }
  return JSON.stringify({results,passed:results.filter(r=>r.pass).length,total:results.length});
})()
`;
const result = spawnSync("obsidian", [`vault=${process.argv[2] ?? "AI-native Knowledge System"}`, "eval", `code=${code}`], {encoding:"utf8"});
if (result.error) throw result.error;
const output = result.stdout.trim().replace(/^=> /, "");
const report = JSON.parse(output);
writeFileSync(process.argv[3] ?? "companion-runtime-result.json", JSON.stringify(report, null, 2) + "\n");
process.stdout.write(`${report.passed}/${report.total} passed\n`);
process.exitCode = report.passed === report.total ? 0 : 1;

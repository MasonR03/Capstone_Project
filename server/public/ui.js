window.UI = (() => {
  const state = {
    blueScoreText: null,
    redScoreText: null,
    miniCam: null,
    miniSize: 160,
    miniMargin: 16,
    world: { w: 2000, h: 2000 },
    mySprite: null,
    debugPanelEl: null,
    debugBtnEl: null
  };

  function init(scene, opts = {}) {
    state.blueScoreText = scene.add.text(16,16,'Blue: 0',{fontSize:'32px',fill:'#00aaff'}).setScrollFactor(0);
    state.redScoreText  = scene.add.text(640,16,'Red: 0',{fontSize:'32px',fill:'#ff3355'}).setScrollFactor(0);

    if (opts.worldWidth)  state.world.w = opts.worldWidth;
    if (opts.worldHeight) state.world.h = opts.worldHeight;

    const x = 800 - state.miniSize - state.miniMargin;
    const y = 600 - state.miniSize - state.miniMargin;
    state.miniCam = scene.cameras.add(x, y, state.miniSize, state.miniSize);
    state.miniCam.setBackgroundColor(0x001520);
    const zx = state.miniSize / state.world.w;
    const zy = state.miniSize / state.world.h;
    state.miniCam.setZoom(Math.min(zx, zy));
    state.miniCam.centerOn(state.world.w/2, state.world.h/2);

    scene.input.keyboard.on('keydown-M', () => {
      state.miniCam.setVisible(!state.miniCam.visible);
    });

    const g = scene.add.graphics().setScrollFactor(0);
    g.lineStyle(2,0x00ffff,0.85);
    g.strokeRect(x-1,y-1,state.miniSize+2,state.miniSize+2);

    state.debugBtnEl   = document.getElementById('debug-button');
    state.debugPanelEl = document.getElementById('debug-panel');
    if (state.debugBtnEl && state.debugPanelEl) {
      state.debugBtnEl.style.display = 'block';
      state.debugBtnEl.onclick = () => {
        state.debugPanelEl.style.display =
          state.debugPanelEl.style.display === 'none' ? 'block' : 'none';
      };
    }
  }

  function setMinimapTarget(scene, sprite){
    state.mySprite = sprite;
    if(state.miniCam){
      state.miniCam.startFollow(sprite,true,1,1);
    }
  }

  function updateScores(scene, scores){
    if(state.blueScoreText) state.blueScoreText.setText('Blue: '+scores.blue);
    if(state.redScoreText)  state.redScoreText.setText('Red: '+scores.red);
  }

  return { init, setMinimapTarget, updateScores };
})();

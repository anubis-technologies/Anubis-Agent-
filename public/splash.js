document.addEventListener('DOMContentLoaded', function() {

  /* ── Particles ── */
  var cv = document.getElementById('c');
  var ctx = cv.getContext('2d');
  cv.width = 340; cv.height = 400;

  function mkp() {
    return {
      x: Math.random()*340, y: Math.random()*400,
      vx: (Math.random()-0.5)*0.16, vy: (Math.random()-0.5)*0.16-0.03,
      life: 0, ml: 220+Math.random()*280,
      r: Math.random()*0.8+0.2, gold: Math.random()>0.4
    };
  }
  var pts = [];
  for (var i=0; i<48; i++) { var p=mkp(); p.life=Math.random()*p.ml; pts.push(p); }

  function loop() {
    ctx.clearRect(0,0,340,400);
    pts.forEach(function(p) {
      p.x+=p.vx; p.y+=p.vy; p.life++;
      if (p.life>p.ml||p.y<-5) { var n=mkp(); Object.assign(p,n); p.life=0; }
      var t=p.life/p.ml, a=t<0.2?t*5:t>0.8?(1-t)*5:1;
      ctx.fillStyle=p.gold?'rgba(212,175,55,'+(a*0.32)+')':'rgba(255,255,255,'+(a*0.06)+')';
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.fill();
    });
    requestAnimationFrame(loop);
  }
  loop();

  /* ── Typewriter ── */
  var TEXT = 'Welcome to Anubis Agent';
  var typedEl  = document.getElementById('typed');
  var cursorEl = document.getElementById('cursor');
  var ruleEl   = document.getElementById('rule');
  var btn      = document.getElementById('btn');
  var idx = 0;

  function typeChar() {
    if (idx < TEXT.length) {
      typedEl.textContent += TEXT[idx++];
      setTimeout(typeChar, idx===1 ? 480 : 65+Math.random()*32);
    } else {
      setTimeout(function(){ ruleEl.classList.add('show'); }, 180);
      setTimeout(function(){ cursorEl.style.display='none'; }, 1000);
      setTimeout(function(){ btn.classList.add('show'); }, 1200);
    }
  }
  setTimeout(typeChar, 820);

  /* ── Button ── */
  btn.addEventListener('click', function() {
    try {
      chrome.tabs.query({active:true,currentWindow:true}, function(tabs) {
        var tabId = tabs && tabs[0] && tabs[0].id;
        if (tabId!=null && chrome.sidePanel && chrome.sidePanel.open) {
          chrome.sidePanel.open({tabId:tabId}).catch(function(){});
        }
      });
    } catch(e) {}
    window.close();
  });

});

(function(){
  /* schedule (example data) */
  var week=[
    {d:'Måndag',s:[['17.00–17.45','Barn 7–9 år, nybörjare','barn','Barn'],['17.50–18.50','Barn 10–13 år, fortsättning','barn','Barn'],['19.00–20.15','Vuxna, alla nivåer','vuxna','Vuxna']]},
    {d:'Onsdag',s:[['17.00–17.45','Barn 7–9 år, nybörjare','barn','Barn'],['17.50–18.50','Barn 10–13 år, fortsättning','barn','Barn'],['19.00–20.15','Vuxna, nybörjare och återvändare','vuxna','Vuxna']]},
    {d:'Torsdag',s:[['17.00–18.00','Barn, fortsättning','barn','Barn'],['18.15–19.30','Vuxna, alla nivåer','vuxna','Vuxna']]}
  ];
  var tabs=document.getElementById('tabs'), day=document.getElementById('day');
  function show(i){
    Array.prototype.forEach.call(tabs.children,function(b,j){b.setAttribute('aria-selected',j===i?'true':'false');});
    day.textContent='';
    week[i].s.forEach(function(r){
      var row=document.createElement('div');row.className='sess';
      var t=document.createElement('time');t.textContent=r[0];
      var box=document.createElement('div');
      var name=document.createElement('span');name.textContent=r[1];
      var tag=document.createElement('span');tag.className='tag '+r[2];tag.textContent=r[3];
      box.appendChild(name);box.appendChild(tag);row.appendChild(t);row.appendChild(box);day.appendChild(row);
    });
  }
  week.forEach(function(w,i){
    var b=document.createElement('button');b.type='button';b.setAttribute('role','tab');b.textContent=w.d;
    b.addEventListener('click',function(){show(i);});tabs.appendChild(b);
  });
  show(0);


  /* booking form (demo) */
  var form=document.getElementById('form'), done=document.getElementById('done'), err=document.getElementById('err');
  var submit=document.getElementById('submit'), ageField=document.getElementById('age-field');
  var whoBarn=document.getElementById('who-barn'), whoDu=document.getElementById('who-du');
  var LABELS={termin:'Skicka anmälan',prov:'Boka provträning',present:'Beställ presentkort'};
  var DONE={termin:'Anmälan skickad.',prov:'Provträning bokad.',present:'Beställning skickad.'};
  function goal(){var r=form.querySelector('input[name="goal"]:checked');return r?r.value:'termin';}
  function sync(){submit.textContent=LABELS[goal()];ageField.hidden=!whoBarn.checked;}
  form.addEventListener('change',sync);
  document.addEventListener('click',function(e){
    var a=e.target.closest?e.target.closest('[data-goal],[data-who]'):null; if(!a)return;
    var g=a.getAttribute('data-goal'), w=a.getAttribute('data-who');
    if(g){var r=form.querySelector('input[name="goal"][value="'+g+'"]'); if(r)r.checked=true;}
    if(w==='barn'){whoBarn.checked=true;whoDu.checked=false;}
    if(w==='du'){whoDu.checked=true;whoBarn.checked=false;}
    form.hidden=false;done.hidden=true;sync();
    if(dlg.open)dlg.close();
  });
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var ok=document.getElementById('name').value.trim()&&document.getElementById('email').checkValidity()&&document.getElementById('email').value;
    err.hidden=!!ok; if(!ok)return;
    done.querySelector('b').textContent=DONE[goal()];
    form.hidden=true;done.hidden=false;
  });

  /* game sheet: the game loads in an iframe when the sheet opens and is removed when it closes */
  var GAME_URL='https://storpappor.github.io/tamas-mobile-preview/combined/';
  var dlg=document.getElementById('game'), sheet=dlg.querySelector('.sheet'), screen=document.getElementById('screen'), frame=null;
  var coarse=window.matchMedia('(pointer: coarse)');
  function frameHeight(){
    /* the game page: 16px padding around, a 16:9 stage, HUD and borders about 79px, touch controls 201px on touch screens */
    var stage=Math.round((screen.clientWidth-32)*9/16);
    return stage+79+32+(coarse.matches?201:0);
  }
  function sizeFrame(){if(frame)screen.style.height=frameHeight()+'px';}
  function openGame(){
    if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');
    if(frame)return;
    frame=document.createElement('iframe');
    frame.title='Master Tamas: Siege of Sanshin';
    frame.setAttribute('allow','autoplay');
    sheet.classList.add('loading');
    frame.addEventListener('load',function(){sheet.classList.remove('loading');sheet.classList.add('playing');});
    screen.appendChild(frame);
    sizeFrame();
    frame.src=GAME_URL;
  }
  function closeGame(){
    if(frame){frame.src='about:blank';frame.remove();frame=null;}
    sheet.classList.remove('loading','playing');
    screen.style.height='';
  }
  document.getElementById('fab').addEventListener('click',openGame);
  document.getElementById('game-close').addEventListener('click',function(){dlg.close();});
  dlg.addEventListener('click',function(e){if(e.target===dlg)dlg.close();});
  dlg.addEventListener('close',closeGame);
  window.addEventListener('resize',sizeFrame);
  sync();

  /* the fixed bar hides while the first-view buttons or the form are on screen */
  var bar=document.getElementById('bookbar'), fab=document.getElementById('fab'), seen={hero:true,form:false};
  function bars(){bar.hidden=seen.hero||seen.form;fab.hidden=seen.form;document.body.classList.toggle('nobar',bar.hidden);}
  if('IntersectionObserver' in window){
    new IntersectionObserver(function(en){seen.hero=en[0].isIntersecting;bars();},{threshold:0.5}).observe(document.querySelector('.cta-row .primary'));
    new IntersectionObserver(function(en){seen.form=en[0].isIntersecting;bars();},{threshold:0.25}).observe(document.getElementById('boka'));
    bars();
  }

  /* scroll: phrases light up, the three years step through */
  var reduce=window.matchMedia('(prefers-reduced-motion: reduce)');
  var s2=document.querySelector('.s2'), lit2=Array.prototype.slice.call(s2.querySelectorAll('.lit-list li'));
  var disc=Array.prototype.slice.call(document.querySelectorAll('.disc li'));
  var s3=document.querySelector('.s3'), steps=Array.prototype.slice.call(s3.querySelectorAll('.st')), ticking=false;
  function prog(el,vh){var r=el.getBoundingClientRect(), total=r.height-vh;return total>0?Math.min(1,Math.max(0,-r.top/total)):0;}
  function update(){
    ticking=false;
    var vh=window.innerHeight;
    if(reduce.matches){lit2.concat(disc).forEach(function(li){li.classList.add('on');});return;}
    var p2=prog(s2,vh);
    lit2.forEach(function(li,i){li.classList.toggle('on',p2>=0.03+i*0.1);});
    disc.forEach(function(li){li.classList.toggle('on',li.getBoundingClientRect().top<vh*0.7);});
    var p3=prog(s3,vh), started=s3.getBoundingClientRect().top<vh*0.25;
    var step=!started?0:(p3<0.36?1:(p3<0.7?2:3));
    s3.classList.toggle('go',step>0);
    steps.forEach(function(st,i){st.classList.toggle('on',i+1===step);st.classList.toggle('post',i+1<step);});
  }
  function onScroll(){if(!ticking){ticking=true;requestAnimationFrame(update);}}
  window.addEventListener('scroll',onScroll,{passive:true});
  window.addEventListener('resize',onScroll);
  if(reduce.addEventListener){reduce.addEventListener('change',update);}
  update();
})();

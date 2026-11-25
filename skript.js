(function(){
  /* On GitHub Pages (the shared preview) there is no server: schedule and form stay a demo there. */
  var DEMO=/github\.io$/.test(location.hostname)||location.protocol==='file:';

  /* schedule: the weekly pattern lives in schema.js; with a server, real weeks with instructors are shown */
  var week=window.SCHEMA||[], grid=document.getElementById('weekgrid'), nav=document.getElementById('weeknav');
  var TAGS={}; week.forEach(function(w){w.s.forEach(function(r){TAGS[r[1]]=[r[2],r[3]];});});
  var DAYS=['Söndag','Måndag','Tisdag','Onsdag','Torsdag','Fredag','Lördag'];
  var MONTHS=['jan','feb','mar','apr','maj','jun','jul','aug','sep','okt','nov','dec'];
  function mk(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function toDate(s){var p=s.split('-');return new Date(+p[0],+p[1]-1,+p[2]);}
  var CATS={barn:['barn','Barn'],ungdom:['ungdom','Ungdom'],vuxna:['vuxna','Vuxna'],'ungdom-vuxna':['vuxna','Vuxna och ungdom']};
  function session(time,group,extra,off,cat){
    var row=mk('div','sess'+(off?' off':'')), box=mk('div'), tg=CATS[cat]||TAGS[group];
    box.appendChild(mk('span',null,group));
    if(tg)box.appendChild(mk('span','tag '+tg[0],tg[1]));
    if(extra)box.appendChild(mk('span','leader',extra));
    row.appendChild(mk('time',null,time));row.appendChild(box);return row;
  }
  function fit(){var n=grid.querySelectorAll('.day').length||1;grid.style.setProperty('--dagar',n);grid.classList.toggle('many',n>=5);}
  function drawPattern(){
    grid.textContent='';
    week.forEach(function(w){
      var day=mk('div','day');day.appendChild(mk('h3',null,w.d));
      w.s.forEach(function(r){day.appendChild(session(r[0],r[1]));});
      grid.appendChild(day);
    });
    fit();
  }
  var offset=0, prev=document.getElementById('wk-prev'), next=document.getElementById('wk-next'), label=document.getElementById('wk-label');
  function loadWeek(n){
    prev.disabled=next.disabled=true;
    fetch('api/index.php?do=schema&vecka='+n).then(function(r){if(!r.ok)throw 0;return r.json();}).then(function(j){
      offset=n;
      var a=toDate(j.fran), b=toDate(j.till);
      label.textContent='Vecka '+j.vecka+' · '+a.getDate()+(a.getMonth()!==b.getMonth()?' '+MONTHS[a.getMonth()]:'')+'–'+b.getDate()+' '+MONTHS[b.getMonth()];
      grid.textContent='';
      var day=null, last='';
      j.pass.forEach(function(p){
        if(p.datum!==last){last=p.datum;var d=toDate(p.datum);day=mk('div','day');day.appendChild(mk('h3',null,DAYS[d.getDay()]+' '+d.getDate()+' '+MONTHS[d.getMonth()]));grid.appendChild(day);}
        day.appendChild(session(p.tid,(p.extra?'Extrapass: ':'')+p.grupp,
          p.installt?'Inställt'+(p.orsak?': '+p.orsak:''):p.ledare.length?'Leds av '+p.ledare.join(' och '):'Instruktör meddelas',p.installt,p.kategori));
      });
      if(!j.pass.length)grid.appendChild(mk('p','note','Ingen träning den här veckan.'));
      fit();
      nav.hidden=false;prev.disabled=n<=0;next.disabled=!!j.sista;
    }).catch(function(){ if(!grid.children.length)drawPattern(); prev.disabled=offset<=0; next.disabled=false; });
  }
  drawPattern();
  if(!DEMO){
    prev.addEventListener('click',function(){loadWeek(offset-1);});
    next.addEventListener('click',function(){loadWeek(offset+1);});
    loadWeek(0);
  }


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
  var ERR_TEXT=err.textContent, shown=Date.now();
  form.addEventListener('submit',function(e){
    e.preventDefault();
    var email=document.getElementById('email');
    var ok=document.getElementById('name').value.trim()&&email.checkValidity()&&email.value;
    err.textContent=ERR_TEXT; err.hidden=!!ok; if(!ok)return;
    function finish(){
      done.querySelector('b').textContent=DONE[goal()];
      if(!DEMO) done.querySelector('p').textContent='Vi har skickat en bekräftelse till '+email.value.trim()+'.';
      form.hidden=true;done.hidden=false;
    }
    if(DEMO){finish();return;}
    var who=[].map.call(form.querySelectorAll('input[name="who"]:checked'),function(i){return i.value;});
    var label=submit.textContent; submit.disabled=true; submit.textContent='Skickar …';
    fetch('api/index.php?do=anmalan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
      arende:goal(), vem:who, alder:whoBarn.checked?document.getElementById('age').value:'',
      namn:document.getElementById('name').value, epost:email.value, mobil:document.getElementById('tel').value,
      webbplats:document.getElementById('webbplats').value, tid:Date.now()-shown
    })}).then(function(r){
      return r.json().catch(function(){return {};}).then(function(j){ if(!r.ok) throw new Error(j.fel||''); });
    }).then(finish,function(x){
      err.textContent=(!(x instanceof TypeError)&&x&&x.message)||'Det gick inte att skicka. Kolla uppkopplingen och försök igen.'; err.hidden=false;
    }).then(function(){submit.disabled=false;submit.textContent=label;});
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

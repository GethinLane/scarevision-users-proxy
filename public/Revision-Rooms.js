(function(){
    // Start now / schedule toggle (unchanged behaviour)
    const startNowBtn = document.getElementById('startNowBtn');
    const scheduleLaterBtn = document.getElementById('scheduleLaterBtn');
    const scheduleWrap = document.getElementById('scheduleWrap');
    const startTimeInput = document.getElementById('startTimeInput');

    if(startNowBtn && scheduleLaterBtn && scheduleWrap && startTimeInput){
      function setMode(mode){
        const now = mode === 'now';
        startNowBtn.classList.toggle('is-active', now);
        scheduleLaterBtn.classList.toggle('is-active', !now);
        scheduleWrap.style.display = now ? 'none' : 'block';

        // "Start now" = empty datetime input
        if (now) startTimeInput.value = '';
      }

      startNowBtn.addEventListener('click', () => setMode('now'));
      scheduleLaterBtn.addEventListener('click', () => setMode('later'));
      setMode('now');
    }

    // Why panel toggle
    const whyBtn = document.getElementById('whyMeetingLinkBtn');
    const whyPanel = document.getElementById('whyMeetingLinkPanel');

    if(whyBtn && whyPanel){
      whyBtn.addEventListener('click', function(){
        const isOpen = whyPanel.style.display === 'block';
        whyPanel.style.display = isOpen ? 'none' : 'block';
      });
    }
  })();

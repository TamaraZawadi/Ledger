// LEDGR Product Tour
// A lightweight, self-contained "spotlight" walkthrough of the landing page.
// Highlights key sections in sequence, then smoothly returns the user
// to the exact scroll position they started from.

(function () {
  let tourSteps = [];
  let currentStep = 0;
  let startScrollY = 0;
  let overlayEl, cardEl;

  function buildSteps() {
    const steps = [];

    // Intro step — stays on hero
    steps.push({
      selector: '.hero-title',
      title: '👋 Welcome to LEDGR',
      text: "Let's take a 60-second look at what LEDGR can do for your business.",
    });

    // One step per feature card, pulled straight from the DOM
    document.querySelectorAll('#features .feature-card').forEach((card) => {
      const title = card.querySelector('h3')?.textContent?.trim() || 'Feature';
      const desc = card.querySelector('p')?.textContent?.trim() || '';
      steps.push({ el: card, title, text: desc });
    });

    // How it works section
    steps.push({
      selector: '#how .section-title',
      title: 'Getting started',
      text: 'Set up your business, add your team, and start tracking — in minutes.',
    });

    // Closing step
    steps.push({
      selector: '.cta-section h2',
      title: "That's LEDGR!",
      text: 'Ready to get every shilling accounted for?',
    });

    return steps;
  }

  function createOverlay() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'tour-overlay';

    cardEl = document.createElement('div');
    cardEl.className = 'tour-card';
    cardEl.innerHTML = `
      <div class="tour-progress"><div class="tour-progress-bar" id="tourProgressBar"></div></div>
      <div class="tour-step-label" id="tourStepLabel"></div>
      <h3 id="tourTitle"></h3>
      <p id="tourText"></p>
      <div class="tour-actions">
        <button class="tour-skip" id="tourSkip">Skip tour</button>
        <div class="tour-nav">
          <button class="tour-btn tour-btn-ghost" id="tourPrev">Back</button>
          <button class="tour-btn tour-btn-primary" id="tourNext">Next →</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlayEl);
    document.body.appendChild(cardEl);

    document.getElementById('tourSkip').onclick = endTour;
    document.getElementById('tourNext').onclick = () => advanceTour(1);
    document.getElementById('tourPrev').onclick = () => advanceTour(-1);
  }

  function highlight(target) {
    document.querySelectorAll('.tour-spotlight').forEach((el) => el.classList.remove('tour-spotlight'));
    if (target) target.classList.add('tour-spotlight');
  }

  function positionCard(target) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const cardHeight = cardEl.offsetHeight;
    const margin = 24;
    let top = rect.bottom + margin;

    // If the card would overflow the viewport, place it above the target instead
    if (top + cardHeight > window.innerHeight - margin) {
      top = rect.top - cardHeight - margin;
    }
    // Clamp within viewport
    top = Math.max(margin, Math.min(top, window.innerHeight - cardHeight - margin));

    cardEl.style.top = `${top}px`;
  }

  function renderStep() {
    const step = tourSteps[currentStep];
    const target = step.el || document.querySelector(step.selector);

    highlight(target);

    document.getElementById('tourStepLabel').textContent = `Step ${currentStep + 1} of ${tourSteps.length}`;
    document.getElementById('tourTitle').textContent = step.title;
    document.getElementById('tourText').textContent = step.text;
    document.getElementById('tourProgressBar').style.width = `${((currentStep + 1) / tourSteps.length) * 100}%`;
    document.getElementById('tourPrev').style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    document.getElementById('tourNext').textContent = currentStep === tourSteps.length - 1 ? 'Finish ✓' : 'Next →';

    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Wait for scroll to settle before positioning the card
      setTimeout(() => positionCard(target), 350);
    }
  }

  function advanceTour(direction) {
    if (currentStep === tourSteps.length - 1 && direction === 1) {
      endTour();
      return;
    }
    currentStep = Math.max(0, Math.min(tourSteps.length - 1, currentStep + direction));
    renderStep();
  }

  function endTour() {
    if (overlayEl) overlayEl.remove();
    if (cardEl) cardEl.remove();
    document.querySelectorAll('.tour-spotlight').forEach((el) => el.classList.remove('tour-spotlight'));
    window.scrollTo({ top: startScrollY, behavior: 'smooth' });
    window.removeEventListener('resize', onResize);
  }

  function onResize() {
    const step = tourSteps[currentStep];
    if (!step) return;
    const target = step.el || document.querySelector(step.selector);
    if (target) positionCard(target);
  }

  window.startProductTour = function () {
    startScrollY = window.scrollY;
    tourSteps = buildSteps();
    currentStep = 0;
    createOverlay();
    renderStep();
    window.addEventListener('resize', onResize);
  };
})();

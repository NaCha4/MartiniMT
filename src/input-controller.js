export function createInputController({ document, window, getContext, submitVote, onChange, now = () => performance.now() }) {
  let gesture, suppressedVoteControl, suppressedVoteUntil = 0, suppressClickUntil = 0;

  function inside(control, x, y) {
    const bounds = control.getBoundingClientRect();
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  }

  function activate(control, voteKey) {
    // Native click can arrive without pointerup. Release the redraw lock in that path too.
    const pending = gesture?.voteControl ? gesture : null;
    if (pending) {
      gesture = null;
      onChange();
    }
    if (!control.isConnected || control.disabled || voteKey !== getContext().voteKey) return;
    if (pending && (pending.moved || pending.voteKey !== voteKey)) return;
    if (control.dataset.numberAction !== undefined) submitVote('number-action', control.dataset.numberAction);
    else if (control.dataset.numberChoice !== undefined) submitVote('number-choice', control.dataset.numberChoice);
    else if (control.dataset.stopwatchAction !== undefined) submitVote('stopwatch-action', control.dataset.stopwatchAction);
    else if (control.dataset.liarAction !== undefined) submitVote('liar-action', control.dataset.liarAction);
    else if (control.dataset.zoomRequest !== undefined) submitVote('zoom', null);
    else if (control.dataset.liarVote !== undefined) submitVote('liar', control.dataset.liarVote);
    else if (control.dataset.oxVote !== undefined) submitVote('ox', control.dataset.oxVote);
    else submitVote('taste', control.dataset.vote);
  }

  function cancel() {
    if (gesture) suppressClickUntil = now() + 400;
    if (gesture?.voteControl) {
      suppressedVoteControl = gesture.voteControl;
      suppressedVoteUntil = now() + 400;
    }
    gesture = null;
    onChange();
  }

  document.addEventListener('pointerdown', event => {
    const context = getContext();
    if (!context.interactive) return;
    if (!event.isPrimary) {
      if (gesture) gesture.moved = true;
      suppressClickUntil = now() + 400;
      return;
    }
    const voteControl = event.target?.closest?.('button[data-vote], button[data-ox-vote], button[data-zoom-request], button[data-liar-vote], button[data-liar-action], button[data-stopwatch-action], button[data-number-action], button[data-number-choice]') ?? null;
    if (context.participant && !voteControl) return;
    if (voteControl && (voteControl.disabled || event.button !== 0)) return;
    suppressedVoteControl = null;
    suppressClickUntil = 0;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, voteControl, voteKey: context.voteKey };
  }, true);

  document.addEventListener('pointermove', event => {
    if (gesture?.id !== event.pointerId) return;
    if (gesture.voteControl) {
      if (!inside(gesture.voteControl, event.clientX, event.clientY)) gesture.moved = true;
    } else if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 12) gesture.moved = true;
  }, true);

  document.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    const pending = gesture;
    const control = pending.voteControl;
    const moved = pending.moved || (!control && Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 12);
    if (moved) suppressClickUntil = now() + 400;
    gesture = null;
    if (control) {
      suppressedVoteControl = control;
      suppressedVoteUntil = now() + 400;
      if (!moved && inside(control, event.clientX, event.clientY)) {
        if (event.cancelable) event.preventDefault();
        activate(control, pending.voteKey);
      }
    }
    onChange();
  }, true);

  document.addEventListener('pointercancel', cancel, true);
  window.addEventListener('blur', cancel);
  document.addEventListener('click', event => {
    if (getContext().interactive && event.detail > 0 && now() < suppressClickUntil) {
      if (event.target?.closest?.('button[data-vote], button[data-ox-vote], button[data-zoom-request], button[data-liar-vote], button[data-liar-action], button[data-stopwatch-action], button[data-number-action], button[data-number-choice]') === suppressedVoteControl) suppressedVoteControl = null;
      event.preventDefault();
      event.stopImmediatePropagation();
    }
  }, true);

  return {
    get active() { return Boolean(gesture); },
    bindVote(control) {
      const voteKey = getContext().voteKey;
      control.addEventListener('click', event => {
        if (event.detail > 0 && control === suppressedVoteControl) {
          suppressedVoteControl = null;
          if (now() < suppressedVoteUntil) return;
        }
        activate(control, voteKey);
      });
    },
  };
}

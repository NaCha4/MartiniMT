import { zoomLevels } from './zoom-model.js';

export function bindZoomEditor(root, { getQuestion, editQuestion, onDragging }) {
  for (const card of root.querySelectorAll('[data-zoom-card]')) {
    const index = card.dataset.zoomCard;
    const source = card.querySelector('[data-zoom-source]');
    let pointerId;

    function refresh() {
      const question = getQuestion(index);
      const levels = zoomLevels(question);
      const level = levels[Number(card.dataset.previewStep)];
      const marker = card.querySelector('[data-zoom-marker]');
      Object.assign(marker.style, {
        left: `${question.focusX * (1 - 1 / level)}%`, top: `${question.focusY * (1 - 1 / level)}%`,
        width: `${100 / level}%`, height: `${100 / level}%`,
      });
      const preview = card.querySelector('[data-zoom-preview]');
      preview.style.setProperty('--zoom', level);
      preview.style.setProperty('--focus-x', `${question.focusX}%`);
      preview.style.setProperty('--focus-y', `${question.focusY}%`);
      card.querySelector('[data-zoom-scale-label]').textContent = `${levels[0]}배`;
      card.querySelector('[data-zoom-focus-x]').value = question.focusX;
      card.querySelector('[data-zoom-focus-y]').value = question.focusY;
      for (const button of card.querySelectorAll('[data-zoom-preview-step]')) {
        button.setAttribute('aria-pressed', String(button.dataset.zoomPreviewStep === card.dataset.previewStep));
      }
    }

    function move(event) {
      const bounds = source.getBoundingClientRect();
      const level = zoomLevels(getQuestion(index))[0];
      const image = source.querySelector('img');
      if (!image.naturalWidth || !image.naturalHeight) return;
      const scale = Math.min(bounds.width / image.naturalWidth, bounds.height / image.naturalHeight);
      const focus = (position, start, size, contentSize) => {
        const halfCrop = size / (2 * level);
        const min = (size - contentSize) / 2 + halfCrop;
        const max = (size + contentSize) / 2 - halfCrop;
        const center = min > max ? size / 2 : Math.max(min, Math.min(max, position - start));
        return Math.max(0, Math.min(100, (center / size - 1 / (2 * level)) / (1 - 1 / level) * 100));
      };
      editQuestion(index, {
        focusX: focus(event.clientX, bounds.left, bounds.width, image.naturalWidth * scale),
        focusY: focus(event.clientY, bounds.top, bounds.height, image.naturalHeight * scale),
      });
      card.dataset.previewStep = '0';
      refresh();
    }

    source.addEventListener('pointerdown', event => {
      if (source.dataset.disabled === 'true' || !event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      pointerId = event.pointerId;
      source.setPointerCapture(pointerId);
      onDragging(true);
      move(event);
    });
    source.addEventListener('pointermove', event => { if (pointerId === event.pointerId) move(event); });
    source.addEventListener('lostpointercapture', () => {
      pointerId = undefined;
      onDragging(false);
    });

    for (const button of card.querySelectorAll('[data-zoom-preview-step]')) {
      button.addEventListener('click', () => { card.dataset.previewStep = button.dataset.zoomPreviewStep; refresh(); });
    }
    for (const input of card.querySelectorAll('[data-zoom-answer], [data-zoom-focus-x], [data-zoom-focus-y], [data-zoom-scale]')) {
      input.addEventListener('input', () => {
        const field = input.dataset.zoomAnswer !== undefined ? 'answer' : input.dataset.zoomFocusX !== undefined ? 'focusX' : input.dataset.zoomFocusY !== undefined ? 'focusY' : 'zoom';
        editQuestion(index, { [field]: field === 'answer' ? input.value : Number(input.value) });
        refresh();
      });
    }
  }
}

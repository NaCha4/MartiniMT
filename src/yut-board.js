import { TEAM_NAMES } from './event-model.js';
import { YUT_WIDTH, YUT_HEIGHT, yutStacks, yutDisplayPosition, yutBoardPosition, isYutBoardPosition } from './yut-model.js';

const boards = new WeakMap();
const pawn = '<svg class="yut-pawn" viewBox="0 0 80 100" aria-hidden="true"><ellipse class="pawn-shadow" cx="40" cy="91" rx="33" ry="7"/><path class="pawn-base" d="M13 77H67L75 89Q40 101 5 89Z"/><ellipse class="pawn-base-top" cx="40" cy="77" rx="27" ry="7"/><path class="pawn-body" d="M21 76Q18 61 34 48L26 50Q19 52 16 44L11 40L18 32L20 23L30 16L30 7L39 14L49 11Q63 21 65 37Q68 50 56 60L58 76Q40 84 21 76Z"/><path class="pawn-shade" d="M49 11Q68 33 54 51Q43 64 48 79L58 76L56 60Q68 50 65 37Q63 21 49 11Z"/><path class="pawn-highlight" d="M26 73Q23 61 41 46M22 29L29 23L37 21"/><path class="pawn-bridle" d="M19 34L37 43L44 35"/><circle class="pawn-eye" cx="29" cy="30" r="2.5"/><circle class="pawn-eye" cx="18" cy="41" r="1.7"/></svg>';

function selectYutPiece(board, record, id) {
  record.selectedId = id;
  board.classList.toggle('has-selected-piece', Boolean(id));
  for (const token of board.querySelectorAll('[data-yut-piece]')) {
    const selected = token.dataset.yutPiece === id;
    token.classList.toggle('is-selected', selected);
    token.setAttribute('aria-pressed', String(selected));
  }
}

export function bindYutBoard(root, options) {
  const board = root.querySelector('[data-yut-board]');
  if (!board) return;
  let record = boards.get(board);
  if (!record) {
    record = { options, positions: {} };
    boards.set(board, record);
    board.addEventListener('pointerdown', event => {
      const token = event.target.closest('[data-yut-piece]');
      if (!token || !event.isPrimary || event.button !== 0 || token.disabled) return;
      event.preventDefault(); event.stopPropagation();
      const id = token.dataset.yutPiece;
      const rect = board.getBoundingClientRect();
      const tokenRect = token.getBoundingClientRect();
      const origin = { x: (tokenRect.x + tokenRect.width / 2 - rect.x) * YUT_WIDTH / rect.width, y: (tokenRect.y + tokenRect.height / 2 - rect.y) * YUT_HEIGHT / rect.height };
      const start = { x: event.clientX, y: event.clientY };
      let position = { x: origin.x, y: origin.y };
      let moved = false;
      record.options.onDrag(true);
      token.style.left = `${origin.x / YUT_WIDTH * 100}%`;
      token.style.top = `${origin.y / YUT_HEIGHT * 100}%`;
      token.setPointerCapture(event.pointerId);
      const move = next => {
        if (next.pointerId !== event.pointerId) return;
        if (!moved && Math.hypot(next.clientX - start.x, next.clientY - start.y) < 5) return;
        moved = true;
        selectYutPiece(board, record, null);
        token.classList.add('is-dragging');
        board.classList.add('is-dragging-piece');
        position = {
          x: Math.max(24, Math.min(YUT_WIDTH - 24, origin.x + (next.clientX - start.x) * YUT_WIDTH / rect.width)),
          y: Math.max(24, Math.min(YUT_HEIGHT - 24, origin.y + (next.clientY - start.y) * YUT_HEIGHT / rect.height)),
        };
        token.style.left = `${position.x / YUT_WIDTH * 100}%`;
        token.style.top = `${position.y / YUT_HEIGHT * 100}%`;
      };
      const finish = next => {
        if (next.pointerId !== event.pointerId) return;
        board.removeEventListener('pointermove', move);
        board.removeEventListener('pointerup', finish);
        board.removeEventListener('pointercancel', finish);
        if (token.hasPointerCapture(event.pointerId)) token.releasePointerCapture(event.pointerId);
        token.classList.remove('is-dragging');
        board.classList.remove('is-dragging-piece');
        record.options.onDrag(false);
        if (next.type === 'pointerup' && moved) {
          record.ignoreClick = true;
          setTimeout(() => { record.ignoreClick = false; }, 0);
          void record.options.onMove(id, yutBoardPosition(position));
        }
      };
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', finish);
      board.addEventListener('pointercancel', finish);
    });
    board.addEventListener('click', event => {
      event.stopPropagation();
      if (record.ignoreClick || record.options.disabled) return;
      const token = event.target.closest('[data-yut-piece]');
      if (token) {
        if (token.disabled) return;
        const id = token.dataset.yutPiece;
        const position = record.options.getGame().pieces[id];
        if (record.selectedId && record.selectedId !== id && isYutBoardPosition(position)) {
          const selected = record.selectedId;
          selectYutPiece(board, record, null);
          void record.options.onMove(selected, position);
        } else selectYutPiece(board, record, record.selectedId === id ? null : id);
        return;
      }
      if (!record.selectedId) return;
      const rect = board.getBoundingClientRect();
      const selected = record.selectedId;
      selectYutPiece(board, record, null);
      void record.options.onMove(selected, yutBoardPosition({ x: (event.clientX - rect.x) * YUT_WIDTH / rect.width, y: (event.clientY - rect.y) * YUT_HEIGHT / rect.height }));
    });
    board.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      const token = event.target.closest('[data-yut-piece]');
      if (token && !token.disabled) {
        selectYutPiece(board, record, null);
        void record.options.onSplit(token.dataset.yutPiece);
      }
    });
  }
  record.options = options;
  const game = options.getGame(), container = board.querySelector('[data-yut-pieces]');
  const stacks = yutStacks(game.pieces);
  for (const token of container.querySelectorAll('[data-yut-piece]')) if (!stacks.some(stack => stack.id === token.dataset.yutPiece)) token.remove();
  for (const stack of stacks) {
    let token = container.querySelector(`[data-yut-piece="${stack.id}"]`);
    if (!token) {
      token = document.createElement('button');
      token.className = 'yut-piece';
      token.dataset.yutPiece = stack.id;
      token.dataset.team = stack.team;
      const previous = yutDisplayPosition(record.positions[stack.id] ?? stack, stack.id);
      token.style.left = `${previous.x / YUT_WIDTH * 100}%`;
      token.style.top = `${previous.y / YUT_HEIGHT * 100}%`;
      container.append(token);
      token.getBoundingClientRect();
    }
    token.innerHTML = `${pawn}<span class="yut-piece-label">${TEAM_NAMES[stack.team]} · ${stack.id[1]}</span>${stack.ids.length > 1 ? `<b class="yut-stack-count">×${stack.ids.length}</b>` : ''}`;
    token.setAttribute('aria-label', `${TEAM_NAMES[stack.team]} ${stack.id[1]}번 말${stack.ids.length > 1 ? ` ${stack.ids.length}개 업음` : ''}`);
    token.classList.toggle('is-stack', stack.ids.length > 1);
    token.disabled = options.disabled || game.control?.phase !== 'playing';
    const position = yutDisplayPosition(stack, stack.id);
    token.style.left = `${position.x / YUT_WIDTH * 100}%`;
    token.style.top = `${position.y / YUT_HEIGHT * 100}%`;
  }
  record.positions = game.pieces ?? {};
  if (!stacks.some(stack => stack.id === record.selectedId)) record.selectedId = null;
  selectYutPiece(board, record, record.selectedId);
}

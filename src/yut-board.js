import { TEAM_NAMES } from './event-model.js';
import { YUT_WIDTH, YUT_HEIGHT, yutStacks } from './yut-model.js';

const boards = new WeakMap();

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
      record.options.onDrag(true);
      token.classList.add('is-dragging');
      token.style.left = `${origin.x / YUT_WIDTH * 100}%`;
      token.style.top = `${origin.y / YUT_HEIGHT * 100}%`;
      board.setPointerCapture(event.pointerId);
      const move = next => {
        if (next.pointerId !== event.pointerId) return;
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
        if (board.hasPointerCapture(event.pointerId)) board.releasePointerCapture(event.pointerId);
        token.classList.remove('is-dragging');
        record.options.onDrag(false);
        if (next.type === 'pointerup') void record.options.onMove(id, position);
      };
      board.addEventListener('pointermove', move);
      board.addEventListener('pointerup', finish);
      board.addEventListener('pointercancel', finish);
    });
    board.addEventListener('contextmenu', event => {
      event.preventDefault(); event.stopPropagation();
      const token = event.target.closest('[data-yut-piece]');
      if (token && !token.disabled) void record.options.onSplit(token.dataset.yutPiece);
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
      const previous = record.positions[stack.id] ?? stack;
      token.style.left = `${previous.x / YUT_WIDTH * 100}%`;
      token.style.top = `${previous.y / YUT_HEIGHT * 100}%`;
      container.append(token);
      token.getBoundingClientRect();
    }
    token.textContent = `${TEAM_NAMES[stack.team]}${stack.ids.length > 1 ? ` ×${stack.ids.length}` : ` · ${stack.id[1]}`}`;
    token.setAttribute('aria-label', `${TEAM_NAMES[stack.team]} ${stack.id[1]}번 말${stack.ids.length > 1 ? ` ${stack.ids.length}개 업음` : ''}`);
    token.classList.toggle('is-stack', stack.ids.length > 1);
    token.disabled = options.disabled || game.control?.phase !== 'playing';
    token.style.left = `${stack.x / YUT_WIDTH * 100}%`;
    token.style.top = `${stack.y / YUT_HEIGHT * 100}%`;
  }
  record.positions = game.pieces ?? {};
}

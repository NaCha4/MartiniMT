import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSubscriptionGroup } from '../src/subscription-group.js';

test('cleared subscriptions ignore late values and errors even when the same path is watched again', () => {
  const listeners = [], values = [], errors = [];
  const group = createSubscriptionGroup((path, onValue, onError) => {
    listeners.push({ path, onValue, onError });
    return () => {};
  });
  group.watch('round', value => values.push(value), error => errors.push(error));
  listeners[0].onValue('first');
  group.clear();
  group.watch('round', value => values.push(value), error => errors.push(error));
  listeners[0].onValue('stale');
  listeners[0].onError('stale error');
  listeners[1].onValue('current');
  listeners[1].onError('current error');
  assert.deepEqual(values, ['first', 'current']);
  assert.deepEqual(errors, ['current error']);
});

test('clearing stops each listener once and invalidates callbacks before unsubscribe runs', () => {
  let stops = 0, deliveries = 0;
  const group = createSubscriptionGroup((path, onValue) => () => {
    stops++;
    onValue('late');
  });
  group.watch('one', () => deliveries++);
  group.watch('two', () => deliveries++);
  group.clear();
  group.clear();
  assert.equal(stops, 2);
  assert.equal(deliveries, 0);
});

test('subscriptions support immediate initial values and an omitted error handler', () => {
  const values = [];
  const group = createSubscriptionGroup((path, onValue, onError) => {
    onValue(path);
    onError(new Error('optional'));
    return () => {};
  });
  group.watch('initial', value => values.push(value));
  assert.deepEqual(values, ['initial']);
  group.clear();
});

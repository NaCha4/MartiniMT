export function createSubscriptionGroup(subscribe) {
  let generation = 0, stops = [];

  return {
    watch(path, onValue, onError) {
      const current = generation;
      stops.push(subscribe(path,
        value => { if (current === generation) onValue(value); },
        error => { if (current === generation) onError?.(error); },
      ));
    },
    clear() {
      generation++;
      const previous = stops;
      stops = [];
      previous.forEach(stop => stop());
    },
  };
}

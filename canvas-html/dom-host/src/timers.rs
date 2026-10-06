//! Deterministic timer ordering, shared by every adapter. Callbacks and their arguments stay
//! in the adapter, keyed by [`TimerId`]; this schedule only knows ids and deadlines.
//!
//! Order: earliest deadline first; equal deadlines run in insertion order. A rescheduled
//! interval timer counts as a new insertion (it runs after timers already waiting for the
//! same deadline).

#[derive(Clone, Copy, Debug, Eq, PartialEq, Hash, PartialOrd, Ord)]
pub struct TimerId(pub u64);

struct Entry<D> {
    id: TimerId,
    deadline: D,
    seq: u64,
}

/// Generic over the deadline type so that adapters can keep their clock representation
/// (Boa uses `Instant`s of a virtual clock, Deno uses visual milliseconds).
pub struct TimerSchedule<D> {
    next_id: u64,
    next_seq: u64,
    entries: Vec<Entry<D>>,
}

impl<D> Default for TimerSchedule<D> {
    fn default() -> Self {
        Self { next_id: 0, next_seq: 0, entries: Vec::new() }
    }
}

impl<D: Copy + PartialOrd> TimerSchedule<D> {
    /// Schedule a new timer. Ids start at 1 and are never reused, so 0 is never a valid id.
    pub fn add(&mut self, deadline: D) -> TimerId {
        self.next_id += 1;
        let id = TimerId(self.next_id);
        self.insert(id, deadline);
        id
    }

    /// Schedule an existing id again (interval timers).
    pub fn reschedule(&mut self, id: TimerId, deadline: D) {
        self.remove(id);
        self.insert(id, deadline);
    }

    fn insert(&mut self, id: TimerId, deadline: D) {
        self.next_seq += 1;
        self.entries.push(Entry { id, deadline, seq: self.next_seq });
    }

    pub fn remove(&mut self, id: TimerId) -> bool {
        let before = self.entries.len();
        self.entries.retain(|e| e.id != id);
        self.entries.len() != before
    }

    pub fn contains(&self, id: TimerId) -> bool {
        self.entries.iter().any(|e| e.id == id)
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    fn first_index(&self) -> Option<usize> {
        let mut best: Option<usize> = None;
        for (i, e) in self.entries.iter().enumerate() {
            best = match best {
                None => Some(i),
                Some(b) => {
                    let current = &self.entries[b];
                    if e.deadline < current.deadline || (e.deadline == current.deadline && e.seq < current.seq) {
                        Some(i)
                    } else {
                        Some(b)
                    }
                }
            };
        }
        best
    }

    /// The deadline of the next timer to run.
    pub fn next_deadline(&self) -> Option<D> {
        self.first_index().map(|i| self.entries[i].deadline)
    }

    /// Remove and return the next timer if it is due at `now`.
    pub fn pop_due(&mut self, now: D) -> Option<(TimerId, D)> {
        let i = self.first_index()?;
        if self.entries[i].deadline <= now {
            let e = self.entries.remove(i);
            Some((e.id, e.deadline))
        } else {
            None
        }
    }

    /// Remove and return every timer due at `now`, in run order.
    pub fn take_due(&mut self, now: D) -> Vec<(TimerId, D)> {
        let mut out = Vec::new();
        while let Some(t) = self.pop_due(now) {
            out.push(t);
        }
        out
    }

    pub fn clear(&mut self) -> Vec<TimerId> {
        self.entries.drain(..).map(|e| e.id).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn deadline_then_insertion_order() {
        let mut s = TimerSchedule::<f64>::default();
        let a = s.add(100.0);
        let b = s.add(50.0);
        let c = s.add(100.0);
        let d = s.add(100.0);
        assert!(s.remove(c));
        assert_eq!(s.next_deadline(), Some(50.0));
        let due: Vec<_> = s.take_due(100.0).into_iter().map(|t| t.0).collect();
        assert_eq!(due, vec![b, a, d]);
        assert!(s.is_empty());
    }

    #[test]
    fn many_equal_deadlines_keep_insertion_order() {
        let mut s = TimerSchedule::<f64>::default();
        let ids: Vec<_> = (0..50).map(|_| s.add(10.0)).collect();
        let due: Vec<_> = s.take_due(10.0).into_iter().map(|t| t.0).collect();
        assert_eq!(due, ids);
    }

    #[test]
    fn rescheduled_interval_runs_after_waiting_timers() {
        let mut s = TimerSchedule::<f64>::default();
        let interval = s.add(10.0);
        let other = s.add(20.0);
        assert_eq!(s.pop_due(10.0).map(|t| t.0), Some(interval));
        s.reschedule(interval, 20.0);
        let due: Vec<_> = s.take_due(20.0).into_iter().map(|t| t.0).collect();
        assert_eq!(due, vec![other, interval]);
    }

    #[test]
    fn not_due_stays() {
        let mut s = TimerSchedule::<f64>::default();
        s.add(10.0);
        assert!(s.pop_due(9.999).is_none());
        assert_eq!(s.len(), 1);
    }
}

//! Online-window calculations in local time, including windows that cross midnight.
//!
//! A configuration holds any number of independent windows. Each window is active from
//! `from` on every selected start day until `until`; when `until <= from` it ends on the
//! following day. The user is Online while at least one window contains the current time.

use chrono::{
    DateTime, Datelike, Days, Duration as ChronoDuration, Local, LocalResult, NaiveDate,
    NaiveDateTime, NaiveTime, TimeZone, Timelike,
};

use crate::config::{Config, ScheduleWindow};
use crate::steam::Persona;

const SECONDS_PER_DAY: i64 = 86_400;

fn parse_hm(value: &str) -> Option<NaiveTime> {
    let (hour, minute) = value.split_once(':')?;
    let hour: u32 = hour.parse().ok()?;
    let minute: u32 = minute.parse().ok()?;
    NaiveTime::from_hms_opt(hour, minute, 0)
}

fn weekday_key(date: NaiveDate) -> &'static str {
    use chrono::Weekday;
    match date.weekday() {
        Weekday::Mon => "mon",
        Weekday::Tue => "tue",
        Weekday::Wed => "wed",
        Weekday::Thu => "thu",
        Weekday::Fri => "fri",
        Weekday::Sat => "sat",
        Weekday::Sun => "sun",
    }
}

/// Local datetime for a naive date/time, tolerating DST gaps and overlaps.
fn local_at(date: NaiveDate, time: NaiveTime) -> Option<DateTime<Local>> {
    match Local.from_local_datetime(&NaiveDateTime::new(date, time)) {
        LocalResult::Single(datetime) => Some(datetime),
        LocalResult::Ambiguous(first, _) => Some(first),
        LocalResult::None => None,
    }
}

fn local_from_ms(timestamp_ms: i64) -> Option<DateTime<Local>> {
    match Local.timestamp_millis_opt(timestamp_ms) {
        LocalResult::Single(datetime) => Some(datetime),
        LocalResult::Ambiguous(first, _) => Some(first),
        LocalResult::None => None,
    }
}

fn shift_days(date: NaiveDate, offset: i64) -> NaiveDate {
    if offset >= 0 {
        date + Days::new(offset as u64)
    } else {
        date - Days::new((-offset) as u64)
    }
}

/// Length of one window in seconds; 0 when `from == until` (no window).
fn window_seconds(window: &ScheduleWindow) -> i64 {
    let Some(from) = parse_hm(&window.from) else {
        return 0;
    };
    let Some(until) = parse_hm(&window.until) else {
        return 0;
    };
    let from = from.num_seconds_from_midnight() as i64;
    let until = until.num_seconds_from_midnight() as i64;
    (until - from + SECONDS_PER_DAY) % SECONDS_PER_DAY
}

/// Whether one window contains `now`, checking both a window started today and one
/// started yesterday that may end today.
fn window_contains(window: &ScheduleWindow, now: DateTime<Local>) -> bool {
    let duration = window_seconds(window);
    if duration == 0 {
        return false;
    }
    let Some(from) = parse_hm(&window.from) else {
        return false;
    };

    for offset in 0..=1i64 {
        let day = shift_days(now.date_naive(), -offset);
        if !window
            .days
            .iter()
            .any(|selected| selected == weekday_key(day))
        {
            continue;
        }
        let Some(start) = local_at(day, from) else {
            continue;
        };
        let end = start + ChronoDuration::seconds(duration);
        if now >= start && now < end {
            return true;
        }
    }
    false
}

/// Are we inside any Online window?
pub fn in_window_at(now: DateTime<Local>, config: &Config) -> bool {
    config
        .windows
        .iter()
        .any(|window| window_contains(window, now))
}

/// Next time the desired presence actually changes, as `(unix milliseconds, target)`.
///
/// Looking at start/end boundaries is not enough when two windows touch: one ending as
/// another starts does not change the presence. Each candidate is evaluated just after
/// the boundary, so the returned pair is always a real transition.
pub fn next_transition(now: DateTime<Local>, config: &Config) -> Option<(i64, Persona)> {
    let now_ms = now.timestamp_millis();
    let currently_online = in_window_at(now, config);
    let mut candidates: Vec<i64> = Vec::new();

    for offset in -1..=8i64 {
        let day = shift_days(now.date_naive(), offset);
        let key = weekday_key(day);
        for window in &config.windows {
            let duration = window_seconds(window);
            if duration == 0 {
                continue;
            }
            if !window.days.iter().any(|selected| selected == key) {
                continue;
            }
            let Some(from) = parse_hm(&window.from) else {
                continue;
            };
            let Some(start) = local_at(day, from) else {
                continue;
            };
            let start_ms = start.timestamp_millis();
            let end_ms = start_ms + duration * 1000;
            if start_ms > now_ms {
                candidates.push(start_ms);
            }
            if end_ms > now_ms {
                candidates.push(end_ms);
            }
        }
    }

    candidates.sort_unstable();
    candidates.dedup();

    for at in candidates {
        let Some(after) = local_from_ms(at + 1) else {
            continue;
        };
        let online_after = in_window_at(after, config);
        if online_after != currently_online {
            return Some((
                at,
                if online_after {
                    Persona::Online
                } else {
                    Persona::Invisible
                },
            ));
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::{Config, ScheduleWindow};

    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Local> {
        match Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
            LocalResult::Single(datetime) => datetime,
            LocalResult::Ambiguous(first, _) => first,
            LocalResult::None => panic!("nonexistent local time in test"),
        }
    }

    fn window(days: &[&str], from: &str, until: &str) -> ScheduleWindow {
        ScheduleWindow {
            days: days.iter().map(|day| day.to_string()).collect(),
            from: from.into(),
            until: until.into(),
        }
    }

    fn config_with(windows: Vec<ScheduleWindow>) -> Config {
        Config {
            windows,
            ..Config::default()
        }
    }

    fn weekday_config() -> Config {
        config_with(vec![window(
            &["mon", "tue", "wed", "thu", "fri"],
            "17:30",
            "01:00",
        )])
    }

    #[test]
    fn window_crossing_midnight() {
        let config = weekday_config();
        // Monday 2026-10-19: window 17:30 -> Tuesday 01:00.
        assert!(!in_window_at(at(2026, 10, 19, 17, 29), &config));
        assert!(in_window_at(at(2026, 10, 19, 17, 30), &config));
        assert!(in_window_at(at(2026, 10, 19, 23, 59), &config));
        assert!(in_window_at(at(2026, 10, 20, 0, 30), &config));
        assert!(!in_window_at(at(2026, 10, 20, 1, 0), &config));
        // Saturday/Sunday are not selected, so Sunday early morning is not a window.
        assert!(!in_window_at(at(2026, 10, 18, 0, 30), &config));
        assert!(!in_window_at(at(2026, 10, 19, 12, 0), &config));
    }

    #[test]
    fn next_transition_is_the_earliest_change() {
        let config = weekday_config();
        let monday_noon = next_transition(at(2026, 10, 19, 12, 0), &config).unwrap();
        assert_eq!(
            monday_noon,
            (at(2026, 10, 19, 17, 30).timestamp_millis(), Persona::Online)
        );

        let monday_evening = next_transition(at(2026, 10, 19, 18, 0), &config).unwrap();
        assert_eq!(
            monday_evening,
            (
                at(2026, 10, 20, 1, 0).timestamp_millis(),
                Persona::Invisible
            )
        );

        // Friday evening crosses into Saturday 01:00 because Friday is selected.
        let friday_night = next_transition(at(2026, 10, 23, 23, 0), &config).unwrap();
        assert_eq!(
            friday_night,
            (
                at(2026, 10, 24, 1, 0).timestamp_millis(),
                Persona::Invisible
            )
        );
    }

    #[test]
    fn independent_weekday_and_weekend_windows() {
        let config = config_with(vec![
            window(&["mon", "tue", "wed", "thu", "fri"], "17:00", "01:15"),
            window(&["sat", "sun"], "10:00", "23:00"),
        ]);

        // Friday night belongs to Friday's weekday window.
        assert!(in_window_at(at(2026, 10, 23, 23, 0), &config));
        assert!(in_window_at(at(2026, 10, 24, 1, 0), &config));
        assert!(!in_window_at(at(2026, 10, 24, 1, 15), &config));
        // Saturday and Sunday use their own hours.
        assert!(!in_window_at(at(2026, 10, 24, 9, 59), &config));
        assert!(in_window_at(at(2026, 10, 24, 10, 0), &config));
        assert!(!in_window_at(at(2026, 10, 24, 23, 0), &config));
        assert!(in_window_at(at(2026, 10, 25, 12, 0), &config));
        assert!(!in_window_at(at(2026, 10, 25, 23, 30), &config));
        // Monday morning is outside both windows.
        assert!(!in_window_at(at(2026, 10, 26, 9, 0), &config));

        assert_eq!(
            next_transition(at(2026, 10, 23, 23, 0), &config).unwrap(),
            (
                at(2026, 10, 24, 1, 15).timestamp_millis(),
                Persona::Invisible
            )
        );
        assert_eq!(
            next_transition(at(2026, 10, 24, 23, 30), &config).unwrap(),
            (at(2026, 10, 25, 10, 0).timestamp_millis(), Persona::Online)
        );
        assert_eq!(
            next_transition(at(2026, 10, 25, 23, 30), &config).unwrap(),
            (at(2026, 10, 26, 17, 0).timestamp_millis(), Persona::Online)
        );
    }

    #[test]
    fn adjacent_windows_skip_the_redundant_boundary() {
        let config = config_with(vec![
            window(&["mon"], "05:00", "10:00"),
            window(&["mon"], "10:00", "12:00"),
        ]);

        assert!(in_window_at(at(2026, 10, 19, 9, 59), &config));
        assert!(in_window_at(at(2026, 10, 19, 10, 0), &config));
        // At 10:00 one window ends and another starts: the presence does not change.
        assert_eq!(
            next_transition(at(2026, 10, 19, 6, 0), &config).unwrap(),
            (
                at(2026, 10, 19, 12, 0).timestamp_millis(),
                Persona::Invisible
            )
        );
    }

    #[test]
    fn overlapping_windows_are_a_union() {
        let config = config_with(vec![
            window(&["mon"], "08:00", "12:00"),
            window(&["mon"], "11:00", "14:00"),
        ]);

        assert!(!in_window_at(at(2026, 10, 19, 7, 59), &config));
        assert!(in_window_at(at(2026, 10, 19, 10, 30), &config));
        assert!(in_window_at(at(2026, 10, 19, 13, 0), &config));
        assert!(!in_window_at(at(2026, 10, 19, 14, 0), &config));
    }

    #[test]
    fn no_window_when_times_match() {
        let config = config_with(vec![window(&["mon"], "10:00", "10:00")]);
        assert!(!in_window_at(at(2026, 10, 19, 10, 0), &config));
        assert!(next_transition(at(2026, 10, 19, 12, 0), &config).is_none());
    }

    #[test]
    fn no_windows_means_no_schedule() {
        let config = config_with(Vec::new());
        assert!(!in_window_at(at(2026, 10, 19, 10, 0), &config));
        assert!(next_transition(at(2026, 10, 19, 12, 0), &config).is_none());
    }
}

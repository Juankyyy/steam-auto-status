//! Online-window calculations in local time. Ported from the old Node sidecar, including
//! the "online window may cross midnight" handling.

use chrono::{
    DateTime, Datelike, Days, Duration as ChronoDuration, Local, LocalResult, NaiveDate,
    NaiveDateTime, NaiveTime, TimeZone, Timelike,
};

use crate::config::Config;
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

fn shift_days(date: NaiveDate, offset: i64) -> NaiveDate {
    if offset >= 0 {
        date + Days::new(offset as u64)
    } else {
        date - Days::new((-offset) as u64)
    }
}

/// Length of the Online window in seconds; 0 when `from == until` (no window).
fn window_seconds(config: &Config) -> i64 {
    let Some(from) = parse_hm(&config.online_from) else {
        return 0;
    };
    let Some(until) = parse_hm(&config.online_until) else {
        return 0;
    };
    let from = from.num_seconds_from_midnight() as i64;
    let until = until.num_seconds_from_midnight() as i64;
    (until - from + SECONDS_PER_DAY) % SECONDS_PER_DAY
}

/// Are we inside an Online window? (checks today's and yesterday's)
pub fn in_window_at(now: DateTime<Local>, config: &Config) -> bool {
    let duration = window_seconds(config);
    if duration == 0 {
        return false;
    }
    let Some(from) = parse_hm(&config.online_from) else {
        return false;
    };

    for offset in 0..=1i64 {
        let day = shift_days(now.date_naive(), -offset);
        let key = weekday_key(day);
        if !config.days.iter().any(|selected| selected == key) {
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

/// Next scheduled change, as `(unix milliseconds, target presence)`.
pub fn next_transition(now: DateTime<Local>, config: &Config) -> Option<(i64, Persona)> {
    let duration = window_seconds(config);
    if duration == 0 {
        return None;
    }
    let from = parse_hm(&config.online_from)?;
    let now_ms = now.timestamp_millis();

    let mut best: Option<(i64, Persona)> = None;
    for offset in -1..=7i64 {
        let day = shift_days(now.date_naive(), offset);
        let key = weekday_key(day);
        if !config.days.iter().any(|selected| selected == key) {
            continue;
        }
        let Some(start) = local_at(day, from) else {
            continue;
        };
        let candidates = [
            (start, Persona::Online),
            (
                start + ChronoDuration::seconds(duration),
                Persona::Invisible,
            ),
        ];
        for (at, to) in candidates {
            let at_ms = at.timestamp_millis();
            if at_ms <= now_ms {
                continue;
            }
            if best.map_or(true, |(best_at, _)| at_ms < best_at) {
                best = Some((at_ms, to));
            }
        }
    }
    best
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::config::Config;

    fn at(year: i32, month: u32, day: u32, hour: u32, minute: u32) -> DateTime<Local> {
        match Local.with_ymd_and_hms(year, month, day, hour, minute, 0) {
            LocalResult::Single(datetime) => datetime,
            LocalResult::Ambiguous(first, _) => first,
            LocalResult::None => panic!("nonexistent local time in test"),
        }
    }

    fn weekday_config() -> Config {
        Config {
            days: ["mon", "tue", "wed", "thu", "fri"]
                .iter()
                .map(|day| day.to_string())
                .collect(),
            online_from: "17:30".into(),
            online_until: "01:00".into(),
            ..Config::default()
        }
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
    fn no_window_when_times_match() {
        let config = Config {
            days: vec!["mon".into()],
            online_from: "10:00".into(),
            online_until: "10:00".into(),
            ..Config::default()
        };
        assert!(!in_window_at(at(2026, 10, 19, 10, 0), &config));
        assert!(next_transition(at(2026, 10, 19, 12, 0), &config).is_none());
    }
}

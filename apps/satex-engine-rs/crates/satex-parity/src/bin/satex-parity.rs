//! `satex-parity` — the oracle's command line (RS-UP-1 / RS-1.4).
//!
//! A dev/CI tool. Nothing here is linked into the shipping terminal, and nothing here is
//! on the live-capital path: it reads two golden streams off disk, compares them, prints
//! the Appendix A.4 drift report and writes the JSONL archive a parity claim needs.
//!
//! ```text
//! satex-parity verify --reference <path> --candidate <path>
//!                     [--jsonl <path>] [--verbose] [--max-divergences <n>]
//!                     [--corpus-sha <hex>] [--golden-sha <hex>]
//!                     [--rs-sha <hex>] [--session <id>]
//! ```
//!
//! ## Exit-code contract
//!
//! | Code | Meaning |
//! |---|---|
//! | 0 | Clean — the candidate reproduced the reference. |
//! | 1 | Divergent — at least one divergence, all of them named in the report. |
//! | 2 | Trouble — bad usage, an unreadable golden, an unwritable report. |
//!
//! Two and one are separate on purpose, and it is the whole reason this binary owns its
//! own exit codes rather than forwarding the library's. A CI job that treats "the file
//! was not there" as "the candidate diverged" wastes an investigation; a job that treats
//! it as "clean" is the false-green shape P-097 named, and this instrument exists to
//! catch that class rather than to demonstrate it. A run that did not compare anything
//! never returns 0.
//!
//! ## No argument-parsing dependency
//!
//! Parsed with `std::env::args` and a `while` loop. The D-012 crate budget buys one
//! runtime dependency for this crate (`sha2`, because the manifest digests are a
//! contract); a flag parser is not worth the second slot, and the whole grammar is four
//! options and four identity strings.
//!
//! `--help` anywhere on the line wins, including in a position where a value was
//! expected. A run that wanted a session literally named `--help` is not one worth
//! supporting.

#![forbid(unsafe_code)]
#![deny(missing_docs)]

use std::fmt;
use std::path::{Path, PathBuf};
use std::process::ExitCode;

use satex_parity::report::{JsonlMode, ReportContext, format_jsonl_report};
use satex_parity::{DEFAULT_MAX_DIVERGENCES, DiffOptions, verify_golden};

/// The candidate reproduced the reference.
const EXIT_CLEAN: u8 = 0;
/// The candidate diverged; the report names where.
const EXIT_DIVERGENT: u8 = 1;
/// Nothing was compared — bad usage or I/O.
const EXIT_TROUBLE: u8 = 2;

/// Help text, printed to stdout on `--help` and to stderr after a usage fault.
const USAGE: &str = "\
satex-parity — SATEX Rust parity oracle (RS-1.4). Dev/CI tool, never shipped.

usage:
  satex-parity verify --reference <path> --candidate <path>
                      [--jsonl <path>] [--verbose] [--max-divergences <n>]
                      [--corpus-sha <hex>] [--golden-sha <hex>]
                      [--rs-sha <hex>] [--session <id>]
  satex-parity help

options:
  --reference <path>     golden the candidate must reproduce (required)
  --candidate <path>     golden under test (required)
  --jsonl <path>         write Appendix A.4 divergence rows here, one JSON object
                         per line; archive under Vault/00-Audit/parity/
  --verbose              JSONL carries the full divergence stream instead of the
                         first divergence per subsystem (the A.4 minimum). Does not
                         change the human report, which has no verbose form.
  --max-divergences <n>  collection cap, at least 1 (default 100)
  --corpus-sha <hex>     run identity stamped on every JSONL row; anything not
  --golden-sha <hex>     given is recorded as null rather than as an empty string,
  --rs-sha <hex>         so an incomplete report is visibly incomplete (Appendix
  --session <id>         A.1: a claim is reproducible from its artifacts)

exit codes:
  0  clean       the candidate reproduced the reference
  1  divergent   at least one divergence; every one of them is in the report
  2  trouble     nothing was compared — bad usage, or a golden that would not read";

/// Everything that can stop a run before a verdict exists. Every one of these exits
/// [`EXIT_TROUBLE`]: the comparison did not happen, which is not a parity result.
#[derive(Debug)]
enum Fault {
    /// The command line did not name a runnable job.
    Usage(String),
    /// A golden would not read, or a report would not write.
    Io(String),
}

impl fmt::Display for Fault {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Usage(message) | Self::Io(message) => f.write_str(message),
        }
    }
}

/// A parsed `verify` invocation.
#[derive(Debug)]
struct Options {
    /// Golden the candidate must reproduce.
    reference: PathBuf,
    /// Golden under test.
    candidate: PathBuf,
    /// Where to write the Appendix A.4 rows, if anywhere.
    jsonl: Option<PathBuf>,
    /// Full divergence stream in the JSONL rather than the A.4 minimum.
    verbose: bool,
    /// Collection cap handed to the differ.
    max_divergences: usize,
    /// Run identity stamped on every JSONL row.
    context: ReportContext,
}

fn main() -> ExitCode {
    let args: Vec<String> = std::env::args().skip(1).collect();
    match run(&args) {
        Ok(code) => ExitCode::from(code),
        Err(fault) => {
            eprintln!("satex-parity: {fault}");
            if matches!(fault, Fault::Usage(_)) {
                eprintln!("\n{USAGE}");
            }
            ExitCode::from(EXIT_TROUBLE)
        }
    }
}

/// Dispatches a command line to a job, returning the process exit code.
fn run(args: &[String]) -> Result<u8, Fault> {
    if args
        .iter()
        .any(|a| a == "--help" || a == "-h" || a == "help")
    {
        println!("{USAGE}");
        return Ok(EXIT_CLEAN);
    }
    let Some(command) = args.first() else {
        return Err(Fault::Usage("no command given".to_owned()));
    };
    match command.as_str() {
        "verify" => execute(&parse_verify(&args[1..])?),
        other => Err(Fault::Usage(format!("unknown command {other:?}"))),
    }
}

/// The value belonging to `name`, from `--name=value` or from the next argument.
fn value_for(
    name: &str,
    inline: Option<&str>,
    args: &[String],
    at: &mut usize,
) -> Result<String, Fault> {
    if let Some(value) = inline {
        return Ok(value.to_owned());
    }
    *at += 1;
    match args.get(*at) {
        Some(value) => Ok(value.clone()),
        None => Err(Fault::Usage(format!("{name} needs a value"))),
    }
}

/// Rejects a value given to a flag that does not take one.
fn no_value(name: &str, inline: Option<&str>) -> Result<(), Fault> {
    match inline {
        None => Ok(()),
        Some(_) => Err(Fault::Usage(format!("{name} takes no value"))),
    }
}

/// Parses the arguments after `verify`.
fn parse_verify(args: &[String]) -> Result<Options, Fault> {
    let mut reference: Option<PathBuf> = None;
    let mut candidate: Option<PathBuf> = None;
    let mut jsonl: Option<PathBuf> = None;
    let mut verbose = false;
    let mut max_divergences = DEFAULT_MAX_DIVERGENCES;
    let mut context = ReportContext::default();

    let mut at = 0;
    while at < args.len() {
        let arg = args[at].as_str();
        // A path may legitimately contain `=`, so only the first one splits, and only
        // when what precedes it looks like a long option.
        let (name, inline) = match arg.split_once('=') {
            Some((head, tail)) if head.starts_with("--") => (head, Some(tail)),
            _ => (arg, None),
        };
        match name {
            "--reference" => {
                reference = Some(PathBuf::from(value_for(name, inline, args, &mut at)?));
            }
            "--candidate" => {
                candidate = Some(PathBuf::from(value_for(name, inline, args, &mut at)?));
            }
            "--jsonl" => jsonl = Some(PathBuf::from(value_for(name, inline, args, &mut at)?)),
            "--verbose" => {
                no_value(name, inline)?;
                verbose = true;
            }
            "--max-divergences" => {
                let raw = value_for(name, inline, args, &mut at)?;
                max_divergences = match raw.parse::<usize>() {
                    Ok(n) if n > 0 => n,
                    // A cap of zero is refused rather than clamped. It would collect no
                    // divergences, so the verdict would read CLEAN over a stream nobody
                    // compared — a green light bought by switching the instrument off.
                    _ => {
                        return Err(Fault::Usage(format!(
                            "--max-divergences needs a positive integer (got {raw:?})"
                        )));
                    }
                };
            }
            "--corpus-sha" => context.corpus_sha = Some(value_for(name, inline, args, &mut at)?),
            "--golden-sha" => context.golden_sha = Some(value_for(name, inline, args, &mut at)?),
            "--rs-sha" => context.rs_sha = Some(value_for(name, inline, args, &mut at)?),
            "--session" => context.session = Some(value_for(name, inline, args, &mut at)?),
            other => return Err(Fault::Usage(format!("unknown option {other:?}"))),
        }
        at += 1;
    }

    let (Some(reference), Some(candidate)) = (reference, candidate) else {
        return Err(Fault::Usage(
            "verify needs both --reference and --candidate".to_owned(),
        ));
    };
    Ok(Options {
        reference,
        candidate,
        jsonl,
        verbose,
        max_divergences,
        context,
    })
}

/// Which slice of the divergence stream the JSONL carries.
fn jsonl_mode(verbose: bool) -> JsonlMode {
    if verbose {
        JsonlMode::FullStream
    } else {
        JsonlMode::FirstPerSubsystem
    }
}

/// Reads a golden stream, naming the file in any failure.
///
/// Invalid UTF-8 is an I/O fault, not a divergence: a golden is JSON text by definition,
/// and a byte sequence that is not text was never a stream this instrument could judge.
fn read_golden(role: &str, path: &Path) -> Result<String, Fault> {
    std::fs::read_to_string(path)
        .map_err(|err| Fault::Io(format!("cannot read {role} {}: {err}", path.display())))
}

/// Runs one comparison: report to stdout, rows to the archive, verdict to the caller.
fn execute(opts: &Options) -> Result<u8, Fault> {
    let reference = read_golden("--reference", &opts.reference)?;
    let candidate = read_golden("--candidate", &opts.candidate)?;

    let verdict = verify_golden(
        &reference,
        &candidate,
        DiffOptions {
            max_divergences: opts.max_divergences,
        },
    );
    println!("{}", verdict.report);

    // Written before the exit code is returned, so a divergent run always leaves its
    // evidence behind: a report that exists only in someone's terminal scrollback is not
    // an archive (RS-L4).
    if let Some(path) = &opts.jsonl {
        let rows = format_jsonl_report(&verdict.diff, &opts.context, jsonl_mode(opts.verbose));
        std::fs::write(path, rows)
            .map_err(|err| Fault::Io(format!("cannot write {}: {err}", path.display())))?;
    }

    // Mapped rather than forwarded: the process contract is this module's, and the
    // library's `exit_code` is an input to it rather than the same number by definition.
    Ok(if verdict.exit_code == 0 {
        EXIT_CLEAN
    } else {
        EXIT_DIVERGENT
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn argv(items: &[&str]) -> Vec<String> {
        items.iter().map(|s| (*s).to_owned()).collect()
    }

    fn parse(items: &[&str]) -> Options {
        match parse_verify(&argv(items)) {
            Ok(opts) => opts,
            Err(fault) => panic!("expected {items:?} to parse, got {fault}"),
        }
    }

    fn fault(items: &[&str]) -> Fault {
        match parse_verify(&argv(items)) {
            Ok(opts) => panic!("expected {items:?} to be refused, got {opts:?}"),
            Err(fault) => fault,
        }
    }

    #[test]
    fn the_minimum_invocation_defaults_the_rest() {
        let opts = parse(&["--reference", "a.jsonl", "--candidate", "b.jsonl"]);
        assert_eq!(opts.reference, PathBuf::from("a.jsonl"));
        assert_eq!(opts.candidate, PathBuf::from("b.jsonl"));
        assert_eq!(opts.jsonl, None);
        assert!(!opts.verbose);
        assert_eq!(opts.max_divergences, DEFAULT_MAX_DIVERGENCES);
        assert_eq!(opts.context, ReportContext::default());
    }

    #[test]
    fn options_also_take_the_inline_equals_form() {
        let opts = parse(&["--reference=a.jsonl", "--candidate=b.jsonl", "--verbose"]);
        assert_eq!(opts.reference, PathBuf::from("a.jsonl"));
        assert!(opts.verbose);
    }

    #[test]
    fn a_path_may_contain_an_equals_sign() {
        let opts = parse(&["--reference=r=1/a.jsonl", "--candidate", "b=2.jsonl"]);
        assert_eq!(opts.reference, PathBuf::from("r=1/a.jsonl"));
        assert_eq!(opts.candidate, PathBuf::from("b=2.jsonl"));
    }

    #[test]
    fn the_run_identity_flags_reach_the_report_context() {
        let opts = parse(&[
            "--reference",
            "a",
            "--candidate",
            "b",
            "--corpus-sha",
            "c0ffee",
            "--golden-sha",
            "g01d",
            "--rs-sha",
            "deadbeef",
            "--session",
            "2026-07-22-open",
        ]);
        assert_eq!(opts.context.corpus_sha.as_deref(), Some("c0ffee"));
        assert_eq!(opts.context.golden_sha.as_deref(), Some("g01d"));
        assert_eq!(opts.context.rs_sha.as_deref(), Some("deadbeef"));
        assert_eq!(opts.context.session.as_deref(), Some("2026-07-22-open"));
    }

    #[test]
    fn both_goldens_are_required() {
        for args in [
            vec!["--reference", "a"],
            vec!["--candidate", "b"],
            vec!["--verbose"],
        ] {
            assert!(matches!(fault(&args), Fault::Usage(_)), "{args:?}");
        }
    }

    #[test]
    fn a_flag_left_without_its_value_is_refused() {
        assert!(matches!(
            fault(&["--reference", "a", "--candidate"]),
            Fault::Usage(_)
        ));
    }

    #[test]
    fn a_boolean_flag_refuses_a_value() {
        assert!(matches!(
            fault(&["--reference", "a", "--candidate", "b", "--verbose=yes"]),
            Fault::Usage(_)
        ));
    }

    #[test]
    fn unknown_options_and_stray_positionals_are_refused() {
        assert!(matches!(
            fault(&["--reference", "a", "--candidate", "b", "--colour"]),
            Fault::Usage(_)
        ));
        assert!(matches!(
            fault(&["--reference", "a", "--candidate", "b", "extra.jsonl"]),
            Fault::Usage(_)
        ));
    }

    #[test]
    fn a_zero_cap_is_refused_because_it_would_report_a_clean_run() {
        // The cap silences collection, and silent collection with an empty divergence
        // list is indistinguishable from parity. Refuse at the door.
        for bad in ["0", "-1", "lots", ""] {
            let args = [
                "--reference",
                "a",
                "--candidate",
                "b",
                "--max-divergences",
                bad,
            ];
            assert!(matches!(fault(&args), Fault::Usage(_)), "{bad:?}");
        }
        let ok = parse(&[
            "--reference",
            "a",
            "--candidate",
            "b",
            "--max-divergences",
            "1",
        ]);
        assert_eq!(ok.max_divergences, 1);
    }

    #[test]
    fn verbose_is_what_selects_the_full_stream() {
        assert_eq!(jsonl_mode(false), JsonlMode::FirstPerSubsystem);
        assert_eq!(jsonl_mode(true), JsonlMode::FullStream);
    }

    #[test]
    fn help_is_a_clean_exit_and_no_command_is_not() {
        match run(&argv(&["--help"])) {
            Ok(code) => assert_eq!(code, EXIT_CLEAN),
            Err(fault) => panic!("--help should not fault: {fault}"),
        }
        match run(&argv(&["verify", "--reference", "a", "--help"])) {
            Ok(code) => assert_eq!(code, EXIT_CLEAN),
            Err(fault) => panic!("--help should win over a half-built command: {fault}"),
        }
        assert!(matches!(run(&argv(&[])), Err(Fault::Usage(_))));
        assert!(matches!(run(&argv(&["diff"])), Err(Fault::Usage(_))));
    }

    #[test]
    fn a_missing_golden_is_trouble_rather_than_divergence() {
        let opts = Options {
            reference: PathBuf::from("no/such/reference.jsonl"),
            candidate: PathBuf::from("no/such/candidate.jsonl"),
            jsonl: None,
            verbose: false,
            max_divergences: DEFAULT_MAX_DIVERGENCES,
            context: ReportContext::default(),
        };
        match execute(&opts) {
            Ok(code) => panic!("a missing golden must not produce a verdict (got {code})"),
            Err(fault) => assert!(matches!(fault, Fault::Io(_)), "{fault}"),
        }
    }
}

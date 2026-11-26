//! Runs every scanner against this machine and prints the results.
//! `cargo test -j 3 live_scan -- --ignored --nocapture`

#[test]
#[ignore]
fn live_scan() {
    // Drivers first, so its WMI query runs before anything else has set up COM in this process.
    let t = std::time::Instant::now();
    println!("drivers: {:#?} ({:?})", super::drivers::check(), t.elapsed());
    println!("hardware: {:#?}", super::hardware::read());
    println!("storage: {:#?}", super::storage::read());
    println!("caches: {:#?}", super::storage::caches());
    println!("stability: {:#?}", super::stability::read());
    println!("startup: {:#?}", super::startup::read());
    println!("memory: {:#?}", super::memory::read());
    println!("security: {:#?}", super::security::read());
    println!("system: {:#?}", super::system::read());
    println!("anticheat: {:#?}", super::anticheat::read());
    println!("crash dumps: {:#?}", super::dumps::list());
    let t = std::time::Instant::now();
    println!("disk usage: {:#?} ({:?})", super::diskusage::read(), t.elapsed());
    println!("store apps: {:#?}", super::storeapps::read());
}

fn main() -> anyhow::Result<()> {
    println!("{}", runtime_poc::smoke()?);
    println!("{}", runtime_poc::bench(10_000)?);
    Ok(())
}

import kotlin.math.floor

fun bankersRound(value: Double): Long {
    val floor = floor(value).toLong()
    val fraction = value - floor
    return when {
        fraction < 0.5 -> floor
        fraction > 0.5 -> floor + 1
        // Exactly 0.5: round to even
        floor % 2 == 0L -> floor
        else -> floor + 1
    }
}

// Test negative values:
println("Testing -2.5:")
println("  floor(-2.5) = " + floor(-2.5).toLong())
println("  fraction = " + (-2.5 - floor(-2.5)))
println("  result = " + bankersRound(-2.5))

println("Testing -3.5:")
println("  floor(-3.5) = " + floor(-3.5).toLong())
println("  fraction = " + (-3.5 - floor(-3.5)))
println("  result = " + bankersRound(-3.5))

println("Testing -1.4:")
println("  floor(-1.4) = " + floor(-1.4).toLong())
println("  fraction = " + (-1.4 - floor(-1.4)))
println("  result = " + bankersRound(-1.4))

println("Testing -1.6:")
println("  floor(-1.6) = " + floor(-1.6).toLong())
println("  fraction = " + (-1.6 - floor(-1.6)))
println("  result = " + bankersRound(-1.6))

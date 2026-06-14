// Fiji/ImageJ macro — runs headless via:
//   ImageJ-win64.exe --headless --console --run measure.ijm "input=...,output=..."
//
// Drop your existing ImageJ steps (image sizing / UV map for pullback) below.
// `getArgument()` returns the "input=...,output=..." string we passed from Python.

args = getArgument();
input  = substring(args, indexOf(args, "input=")  + 6, indexOf(args, ",output="));
output = substring(args, indexOf(args, "output=") + 7);

print("Fiji headless: input=" + input + " output=" + output);

// ============================================================================
// TODO(Mike): paste your ImageJ macro commands here, e.g.:
//   open(input);
//   run("Set Scale...", "...");
//   run("Measure");
//   saveAs("Results", output + "/measurements.csv");
//   // ...UV map / pullback steps...
// ============================================================================

run("Quit");

// Test coupons for dimensioned SVG masters; source art is nominally 20 mm high.
// Pass symbol_file relative to this file, or an absolute path at execution time.
symbol_file = "../assets/symbol-20mm.svg";
finish = "raised"; // [raised, recessed]
mark_scale = 1;
relief = 0.8;
backing = 2.4;
field = 20;
margin = 4;
$fn = 64;
assert(symbol_file != "", "Provide the dimensioned SVG master with symbol_file");
assert(finish == "raised" || finish == "recessed");
assert(relief > 0 && backing > relief && mark_scale > 0);

module mark_2d() {
    scale(mark_scale) import(symbol_file, center = true);
}
module backing_panel() {
    linear_extrude(height = backing)
        offset(r = 3) square([field + 2*margin - 6, field + 2*margin - 6], center = true);
}
// For the actual enclosure, union this overlap into its face or subtract the cutter.
color([0.58, 0.60, 0.57])
if (finish == "raised") {
    union() {
        backing_panel();
        translate([0,0,backing - 0.05]) linear_extrude(height = relief + 0.05) mark_2d();
    }
} else {
    difference() {
        backing_panel();
        translate([0,0,backing - relief]) linear_extrude(height = relief + 0.1) mark_2d();
    }
}

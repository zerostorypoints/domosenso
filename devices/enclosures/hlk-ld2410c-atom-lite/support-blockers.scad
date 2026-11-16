// Non-printing slicer volumes. Import as SUPPORT BLOCKERS, never normal parts.
// Run with -D 'part="support_blockers"' and -D 'blocker_part="tower"'.
// Uses the same dimensions and print transforms as the printable model.
include <enclosure.scad>
blocker_part = "fit_coupon";
assert(part=="support_blockers", "Use build.py --support-blockers; these volumes must not be printed.");

// Overlap the ceiling slightly: excluding only empty space does not suppress
// the overhang that seeds supports in several slicers.
module padded() { minkowski() { children(); cube([1.2,1.2,1.2],center=true); } }
module socket_voids() { padded() { stem(fit_clearance); base_key_slot(); } }
module bearing_voids() {
    translate([0,pivot_y,bearing_low-12])
        cylinder(d=shaft_d+hole_compensation+2*fit_clearance+1.2,h=bearing_h+25);
    padded() translate([0,pivot_y,bearing_top-stop_depth-fit_clearance])
        linear_extrude(height=stop_depth+fit_clearance+1)
            sector_2d(stop_channel_inner,stop_channel_outer,stop_channel_angle);
}
module cradle_voids() {
    // Main case space and the two narrow keeper channels, including their roofs.
    padded() {
        bounds([-atom_width/2-fit_clearance,atom_front-1,dock_z],
               [atom_width/2+fit_clearance,atom_back+fit_clearance,keeper_z+5]);
        for (s=[-1,1]) scale([s,1,1])
            bounds([atom_width/2+fit_clearance-fudge,atom_front-1,keeper_z-fit_clearance],
                   [atom_width/2+fit_clearance+keeper_guide_ear+fit_clearance,atom_back+0.5,keeper_z+wall+fit_clearance]);
    }
}
module rail_voids() {
    padded() bounds([-radar_width/2-fit_clearance,radar_y-radar_fit,radar_bottom],
                    [radar_width/2+fit_clearance,radar_y+radar_thickness+radar_fit,radar_rail_top+2]);
}
if (part=="support_blockers") {
    if (blocker_part=="fit_coupon") {
        translate([33,-37,8-bearing_low]) bearing_voids();
        translate([33,-mast_y,2-base_t-fudge]) socket_voids();
        translate([0,-21,2-dock_z-fudge]) cradle_voids();
        translate([0,0,2-radar_bottom+wall-fudge]) rail_voids();
    }
    if (blocker_part=="tower" || blocker_part=="dock_coupon") translate([0,0,mast_y+mast_depth/2]) rotate([-90,0,0]) {
        bearing_voids();
        padded() base_key_slot();
        padded() dock_voids();
        padded() usb_docking_path();
        wire_loop(0,1.2);
        translate([-mast_width/2-1.4,mast_y,atom_top+8]) rod_y(8,4.2+hole_compensation+1.2);
    }
    if (blocker_part=="head") translate([0,0,-shaft_low]) {
        padded() head_key_slot();
        rail_voids();
    }
    if (blocker_part=="atom_cradle") translate([0,0,-dock_z]) cradle_voids();
    if (blocker_part=="stand") socket_voids();
    if (blocker_part=="clamp") translate([0,0,clamp_width/2]) rotate([0,90,0]) socket_voids();
}

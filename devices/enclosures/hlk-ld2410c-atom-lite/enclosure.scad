// === DESCRIPTION ===
// Open indoor mount for an M5Stack Atom Lite and a vertical Hi-Link LD2410C.
// Assembly: X lateral, Y rear (+), Z up; Z=0 is the desk/shelf top.
// The mast, lift-off Atom cradle and yaw head fit either the desk foot or
// shelf-edge clamp. All fasteners and contact pieces are printed.
// Hardware outline dimensions are nominal. Verify the assumed radar
// thickness and assembled connector/wire envelopes with the fit coupon.
//
// Terminology: "shelf" -> shelf_thickness, shelf_engagement, clamp();
// "radar height" -> radar_center_height; "angle" -> yaw_limit, head();
// "harness" -> harness_height, atom_clearance; "fit" -> fit_clearance.
// Print selectors stand alone at Z=0; assembly selectors show use orientation.
// Final review: 2026-11-15, gpt-6-astra (host-selected); corrective CAD review passed.
// === PRINT SETTINGS ===
// Start with PETG for functional parts; PLA is an option for a rigid mockup.
// 0.2 mm layers, 4 perimeters, 25% gyroid as a starting point.
// Use the supplied print orientation. In the reference orientation place
// supports under the head flange/stop lug and any unsupported bearing/deck
// regions of the tower and coupon. Check support access and bridge quality
// in the clamp socket, key bores and cradle rails before printing.
// Check the preset's elephant-foot compensation on the coupon before printing.
// Consider a brim at the head and both small cradle tooth footprints.
// Confirm supports and compensation in the slicer preview.
// The cap and keeper latch beams bend in the XY layer plane. Use PETG for
// the released latch geometry and verify both snap positions on the coupon.

// === PARAMETERS ===
part = "assembly_stand"; // [tower, head, radar_keeper, atom_cradle, atom_keeper, stand, clamp, clamp_wedge, base_key, head_key, fit_coupon, assembly_stand, assembly_clamp, explode_stand, explode_clamp, clash_stand_tower, clash_clamp_tower, clash_base_insertion, clash_base_key, clash_base_key_near_preload, clash_head_sweep, clash_head_insertion, clash_head_key, clash_head_key_near_preload, clash_radar, clash_radar_insertion, clash_radar_keeper, check_radar_latch_lock, clash_atom, clash_atom_insertion, clash_atom_keeper, check_atom_latch_lock, clash_atom_dock, clash_atom_dock_insertion, clash_usb, clash_gpio, clash_button, clash_wires, clash_shelf, clash_wedge, clash_wedge_insertion]

nozzle_diameter = 0.4;
fit_clearance = 0.30; // Per side, sliding fit; tune using fit_coupon.
hole_compensation = 0.30; // Diametral manufacturing allowance.
radar_center_height = 72; // Lowered from 80 mm to reserve jumper slack.
max_height = 100;
yaw_limit = 60;
yaw = 0; // Assembly preview angle.
radar_width = 22;
radar_height = 16;
radar_thickness = 1.2; // ASSUMED: measure PCB at the supported edge.
radar_rear_depth = 6; // ASSUMED: rear component keepout, excludes plug housing.
radar_rear_width = 16; // ASSUMED: central rear-component/plug envelope.
radar_front_edge_keepout = 0.75; // Check that both face edges are clear of antenna/components.
atom_width = 24;
atom_depth = 24;
atom_height = 9.5;
atom_clearance = 27; // Case underside to the top of either base.
harness_height = 25;
jumper_total_length = 120; // Entire female-to-female jumper, housings included.
atom_connector_housing = 14; // ASSUMED: measure actual rigid length.
radar_connector_housing = 14; // ASSUMED: measure actual rigid length.
jumper_slack_reserve = 5.5; // Allowance beyond modeled route and endpoint provision.
jumper_endpoint_provision = 3; // Provisional allowance for branch lengths; not measured.
jumper_bundle_diameter = 4; // Swept nominal combined bundle clearance.
atom_usb_plug_width = 12; // ASSUMED: actual USB-C plug overmold and access.
atom_usb_plug_height = 6; // ASSUMED.
shelf_thickness = 12;
shelf_engagement = 18;
available_under_edge = 20;
stand_width = 70;
stand_depth = 60;
clamp_width = 38;
wedge_adjustment = 4; // Max x travel left or right from reference.
show_hardware = true;

// === DERIVED CONSTANTS ===
fudge = 0.01;
touch_gap = 0.03;
wall = 4 * nozzle_diameter * 1.125;
$fn = $preview ? 32 : 64;
base_t = 2.5*wall;
mast_y = 8;
mast_width = 28;
mast_depth = 9;
stem_w = 23;
stem_d = 7.6;
stem_h = 9;
socket_t = 3.1;
socket_h = stem_h + 0.65;
socket_w = stem_w + 2*fit_clearance + 2*socket_t;
socket_d = stem_d + 2*fit_clearance + 2*socket_t;
base_key_depth = 2.8;
base_key_z = base_t + 4.7;
base_key_len = socket_w+12;
base_key_lo = 1.8;
base_key_hi = 3.6;
base_key_roof_gap = 0.14;
base_key_bottom_gap = 0.06;

pivot_y = -7.5;
radar_y = -5.7; // PCB front relative to pivot; antenna faces -Y at yaw=0.
radar_bottom = radar_center_height - radar_height/2;
radar_top = radar_center_height + radar_height/2;
deck_z = radar_bottom - 2.8;
bearing_h = 6;
bearing_top = deck_z - 0.07;
bearing_low = bearing_top - bearing_h;
bearing_r = 17;
shaft_d = 13;
shaft_low = bearing_low - 4.8;
head_key_z = bearing_low - 0.04;
head_key_depth = 3.6;
head_key_len = shaft_d+9;
head_key_lo = 1.55;
head_key_hi = 2.65;
head_key_roof_gap = 0.07;
head_disk_r = 14.3;
stop_r = 11.8;
stop_radial = 2.5;
stop_tangent = 3.5;
stop_depth = 2.4;
stop_half_angle = atan((stop_tangent/2)/(stop_r-stop_radial/2));
stop_channel_angle = yaw_limit + stop_half_angle + 1.0;
stop_channel_inner = stop_r-stop_radial/2-fit_clearance;
stop_channel_outer = norm([stop_r+stop_radial/2,stop_tangent/2])+fit_clearance;

atom_y = -15.2;
atom_front = atom_y-atom_depth/2;
atom_back = atom_y+atom_depth/2;
atom_z = base_t+atom_clearance;
atom_top = atom_z+atom_height;
atom_lip = 1.55;
rim_t = wall;
cradle_outer_w = atom_width + 2*(fit_clearance+2*wall);
rail_ear = 4.2;
rail_mount_x = cradle_outer_w/2-rail_ear/2;
dock_ear_depth = 3.1;
dock_ear_h = 6;
dock_z = atom_z-rim_t;
dock_y = mast_y-mast_depth/2-dock_ear_depth-0.15;
hanger_rear = dock_y+dock_ear_depth;
tab_y = atom_back-1.35;
keeper_x = cradle_outer_w/2;
keeper_z = atom_top+fit_clearance;
keeper_guide_ear = 1.15;
atom_latch_x = atom_width/2+fit_clearance+keeper_guide_ear;
atom_latch_t = 1.55;
atom_latch_reach = 0.85;
atom_latch_deflect = 0.90;
atom_latch_tooth_y = atom_front+1.5;
atom_latch_root_y = atom_front+13.0;
radar_rail_x = radar_width/2+fit_clearance;
radar_rail_top = radar_top+2.8;
radar_cap_wall = wall;
radar_cap_depth = radar_thickness+2*(wall+fit_clearance);
radar_fit = fit_clearance;
radar_latch_rail_y = radar_y+radar_thickness+wall+radar_fit;
radar_latch_y = radar_latch_rail_y+1.55;
radar_latch_reach = 0.55;
radar_latch_deflect = 0.70;
radar_latch_t = 1.55;
radar_latch_x = radar_width/2+fit_clearance+wall*0.25;
radar_latch_root_x = 1;
radar_latch_tip_z = radar_rail_top-3.5;
radar_latch_bite_z = radar_rail_top-2.0;
radar_latch_roof = radar_rail_top+radar_cap_wall+touch_gap;
radar_connector_width = 9; // ASSUMED: group of rigid female housings across the lower PCB.
radar_connector_bottom = 2.3;
radar_connector_height = 3.2;
radar_exit_local_y = radar_y + radar_thickness + radar_connector_housing;
shelf_edge = -8.9;
lower_tip = shelf_edge+shelf_engagement;
clamp_back = -13;
jaw_rise_per_mm = 0.10;
wedge_w = 28;
wedge_d = shelf_engagement-3;
wedge_mid_x = 0;
jaw_x0 = -clamp_width/2;
jaw_x1 = clamp_width/2;
jaw_z0 = -shelf_thickness-5.5;
jaw_z1 = jaw_z0+(jaw_x1-jaw_x0)*jaw_rise_per_mm;
wedge_y = shelf_edge+1.7;
wedge_z = -shelf_thickness-touch_gap;
wedge_nominal_bottom = jaw_z0 + (wedge_mid_x-wedge_w/2-jaw_x0)*jaw_rise_per_mm+touch_gap;
clamp_bottom = jaw_z0-5.4;
digit_width = 17;

motion_angles = [-yaw_limit:yaw_limit/12:yaw_limit];
jumper_free = jumper_total_length-atom_connector_housing-radar_connector_housing;
function route(a) =
    let(r=radar_exit_local_y, za=atom_z-atom_connector_housing)
    [[-8.7,atom_y+2.2,za], [-8.7,-9,za-1.75], [-8.7,-4,za],
     [-5,5,31], [-3,15,41.5], [0,15,radar_center_height-8.6],
     [-r*sin(a),pivot_y+r*cos(a),radar_bottom+radar_connector_bottom+radar_connector_height/2]];
function path_length(p,i=0) = i==len(p)-1 ? 0 : norm(p[i+1]-p[i])+path_length(p,i+1);
function route_length(a) = path_length(route(a));
assert(min([for (a=motion_angles) jumper_free-route_length(a)-jumper_endpoint_provision]) >= jumper_slack_reserve,
       "jumper length/housing estimate leaves too little slack; lower radar or measure wires");
base_key_slope = (base_key_hi-base_key_lo)/base_key_len;
base_key_take_up = (base_key_roof_gap+base_key_bottom_gap)/base_key_slope;
base_key_grip_travel = (base_key_len-socket_w)/2-fudge;
head_key_slope = (head_key_hi-head_key_lo)/head_key_len;
head_key_axial_gap = bearing_low-head_key_z;
head_deck_gap = deck_z-bearing_top;
head_key_take_up = (head_key_roof_gap+head_key_axial_gap+head_deck_gap)/head_key_slope;
head_key_grip_travel = (head_key_len-shaft_d)/2-fudge;
assert(base_key_take_up+0.55 < base_key_grip_travel,
       "base key must take up roof and floor clearances before grip reaches socket");
assert(head_key_take_up+0.55 < head_key_grip_travel,
       "head key must take up shaft, bearing and deck clearances before grip reaches shaft");

// Simple small-deflection beam estimate. Confirm snap/release on PETG coupon.
function snap_strain(t,travel,length)=1.5*t*travel/(length*length);
atom_latch_strain = snap_strain(atom_latch_t,atom_latch_deflect,atom_latch_root_y-atom_latch_tooth_y);
radar_latch_strain = snap_strain(radar_latch_t,radar_latch_deflect,radar_latch_x-radar_latch_root_x);
assert(atom_latch_reach-fit_clearance >= 0.25 && atom_latch_deflect>atom_latch_reach-fit_clearance);
assert(radar_latch_reach >= 0.45 && radar_latch_deflect>radar_latch_reach);
assert(max(atom_latch_strain,radar_latch_strain) < 0.025,"Use a longer beam or a shallower detent");
assert(fit_clearance>=0.18 && fit_clearance<=0.55 && wall>=1.55);
assert(radar_rail_top+radar_cap_wall+touch_gap < max_height && radar_center_height==radar_bottom+radar_height/2);
assert(radar_width>=18 && radar_height>=12 && radar_thickness>=0.8 && radar_thickness<=2.5);
assert(radar_rear_width+2*fit_clearance < radar_width-2 && radar_rear_depth>=0);
assert(radar_front_edge_keepout>=0.55 && radar_front_edge_keepout<=1.1);
assert(yaw_limit>=15 && yaw_limit<=70 && abs(yaw)<=yaw_limit);
assert(stop_channel_inner-shaft_d/2>wall && bearing_r-stop_channel_outer>wall);
assert(stop_depth < bearing_h-wall && deck_z-bearing_top>touch_gap);
assert(atom_clearance>=harness_height+2 && harness_height>=25 && atom_top+9 < shaft_low);
assert(atom_width-2*atom_lip>=digit_width && rim_t>=wall);
assert(shelf_thickness>=5 && shelf_thickness<=45);
assert(shelf_engagement>=14 && shelf_engagement<=available_under_edge);
assert((clamp_width-wedge_w)/2 > wedge_adjustment+fit_clearance);
assert(wedge_z-(wedge_nominal_bottom+wedge_w*jaw_rise_per_mm)>=wall);
assert(stand_width>=70 && stand_depth>=60);
assert(stem_w+2*fit_clearance+2*wall <= socket_w && stem_d+2*fit_clearance+2*wall <= socket_d);

echo(radar_center_mm=radar_center_height, max_modeled_height_mm=radar_rail_top+radar_cap_wall+touch_gap,
     harness_below_case_mm=atom_clearance, yaw_degrees=[-yaw_limit,yaw_limit],
     shelf_under_edge_mm=shelf_engagement, shelf_reference_mm=shelf_thickness,
     assumed_radar_pcb_mm=radar_thickness, assumed_rear_mm=radar_rear_depth,
     atom_latch_peak_strain_pct=100*atom_latch_strain,
     radar_latch_peak_strain_pct=100*radar_latch_strain,
     base_key_contact_travel_mm=base_key_take_up,
     base_key_available_travel_mm=base_key_grip_travel,
     head_key_contact_travel_mm=head_key_take_up,
     head_key_available_travel_mm=head_key_grip_travel,
     free_jumper_mm=jumper_free,
     path_mm_by_yaw=[for (a=motion_angles) [a,route_length(a)]],
     minimum_remaining_wire_mm=jumper_free-jumper_endpoint_provision-max([for (a=motion_angles) route_length(a)]));

module bounds(lo,hi) { translate(lo) cube(hi-lo); }
module rounded_rect(w,d,r) { offset(r=r) square([w-2*r,d-2*r],center=true); }
module flat_base(w,d,r,h) {
    ef=0.35;
    hull() {
        linear_extrude(height=fudge) offset(delta=-ef) rounded_rect(w,d,r);
        translate([0,0,ef]) linear_extrude(height=fudge) rounded_rect(w,d,r);
    }
    translate([0,0,ef]) linear_extrude(height=h-ef) rounded_rect(w,d,r);
}
// Extrude X/Z polygon from Y0 towards Y1.
module xz_prism(points,y0,y1) {
    translate([0,y1,0]) rotate([90,0,0]) linear_extrude(height=y1-y0) polygon(points);
}
module rod_x(len,d) { rotate([0,90,0]) cylinder(h=len,d=d,center=true); }
module rod_y(len,d) { rotate([90,0,0]) cylinder(h=len,d=d,center=true); }
module tapered_key(len,depth,hlo,hhi,grip=4) union() {
    xz_prism([[-len/2,0],[len/2,0],[len/2,hlo],[-len/2,hhi]],-depth/2,depth/2);
    bounds([-len/2-grip,-depth/2-0.9,0],[-len/2+fudge,depth/2+0.9,hhi]);
}
module stem(clear=0) {
    translate([0,mast_y,base_t+touch_gap-clear])
        linear_extrude(height=socket_h+2*clear+0.5)
            offset(delta=clear) polygon([
                [-stem_w/2,-stem_d/2],[stem_w/2,-stem_d/2],
                [stem_w/2,stem_d/2-2.2],[stem_w/2-2.2,stem_d/2],
                [-stem_w/2,stem_d/2]]);
}
module base_key_slot() {
    key_channel(0,mast_y,base_key_z,base_key_len,base_key_depth,base_key_lo,base_key_hi,base_key_roof_gap,base_key_bottom_gap);
}
function key_height(x,len,lo,hi) = hi-(x+len/2)*(hi-lo)/len;
module key_channel(x,y,z,len,d,lo,hi,gap,bottom_gap=fit_clearance) {
    // The taper rises as the key is driven further to +X. Nominal/released
    // CSG checks use a gap. Actual preload requires a coupon and real parts.
    m=len/2-0.8;
    translate([x,y,z]) xz_prism([
        [-m,-bottom_gap],[m,-bottom_gap],
        [m,key_height(m,len,lo,hi)+gap],[-m,key_height(-m,len,lo,hi)+gap]],
        -d/2-fit_clearance,d/2+fit_clearance);
}
module base_key_use(dx=0) {
    translate([dx,mast_y,base_key_z]) tapered_key(base_key_len,base_key_depth,base_key_lo,base_key_hi);
}
module socket() {
    difference() {
        bounds([-socket_w/2,mast_y-socket_d/2,base_t-fudge],
               [ socket_w/2,mast_y+socket_d/2,base_t+socket_h]);
        stem(fit_clearance);
        // Open roof and insertion approach of the keyed bore.
        translate([0,0,0.50]) stem(fit_clearance);
        base_key_slot();
    }
}
module stand() {
    union() {
        translate([0,-1,0]) flat_base(stand_width,stand_depth,6,base_t);
        socket();
    }
}
module jaw_bottom() {
    xz_prism([[jaw_x0,clamp_bottom],[jaw_x1,clamp_bottom],
              [jaw_x1,jaw_z1],[jaw_x0,jaw_z0]],clamp_back,lower_tip);
}
module clamp() {
    union() {
        // Horizontal top contact face, with overhang reaching well into shelf.
        bounds([jaw_x0,clamp_back,0],[jaw_x1,23,base_t]);
        // Wall stops against the vertical shelf edge. Thicker at the spine.
        bounds([jaw_x0,clamp_back,clamp_bottom],[jaw_x1,shelf_edge-touch_gap,base_t-fudge]);
        jaw_bottom();
        // A raised back guide holds the wedge clear of the shelf edge.
        bounds([jaw_x0,shelf_edge-0.3,jaw_z0-0.3],[jaw_x1,wedge_y-fit_clearance,jaw_z1+1.4]);
        socket();
    }
}
module wedge_use(dx=0) {
    // X translation on the sloping bed raises the flat upper face.
    translate([dx,0,dx*jaw_rise_per_mm]) xz_prism([
        [-wedge_w/2,wedge_nominal_bottom],
        [wedge_w/2,wedge_nominal_bottom+wedge_w*jaw_rise_per_mm],
        [wedge_w/2,wedge_z],[-wedge_w/2,wedge_z]],
        wedge_y,wedge_y+wedge_d);
    // Low pull tab remains outside the clamp side at the working position.
    translate([dx,0,dx*jaw_rise_per_mm]) xz_prism([
        [-wedge_w/2-12,wedge_nominal_bottom-12*jaw_rise_per_mm],
        [-wedge_w/2+0.4,wedge_nominal_bottom+0.4*jaw_rise_per_mm],
        [-wedge_w/2+0.4,wedge_z],[-wedge_w/2-12,wedge_z]],
        wedge_y+3,wedge_y+9);
}
module shelf() {
    bounds([-48,shelf_edge,-shelf_thickness],[48,46,-touch_gap]);
}
module mast_strip(x1,z1,x2,z2,d=5.7) {
    hull() {
        translate([x1,mast_y,z1]) rod_y(mast_depth,d);
        translate([x2,mast_y,z2]) rod_y(mast_depth,d);
    }
}
module dock_pocket(x,clear=0) {
    bounds([x-rail_ear/2-clear,dock_y-clear,dock_z-clear],
           [x+rail_ear/2+clear,hanger_rear+clear,dock_z+dock_ear_h+clear]);
}
module dock() {
    for (x=[-rail_mount_x,rail_mount_x]) difference() {
        bounds([x-rail_ear/2-2.4,dock_y-1.25,dock_z-2.4],
               [x+rail_ear/2+2.4,mast_y+0.4,dock_z+dock_ear_h]);
        bounds([x-rail_ear/2-fit_clearance,dock_y-fit_clearance,dock_z-fit_clearance],
               [x+rail_ear/2+fit_clearance,hanger_rear+fit_clearance,dock_z+dock_ear_h+fudge]);
    }
}
module sector_2d(ri,ro,a) {
    n=ceil(2*a/3);
    polygon(concat([for (i=[0:n]) let(t=-a+2*a*i/n) [ro*cos(t),ro*sin(t)]],
                   [for (i=[n:-1:0]) let(t=-a+2*a*i/n) [ri*cos(t),ri*sin(t)]]));
}
module bearing() {
    difference() {
        union() {
            translate([0,pivot_y,bearing_low]) cylinder(r=bearing_r,h=bearing_h);
            // Rear bridge laps well over both mast uprights.
            hull() {
                bounds([-10,1,bearing_low],[10,3,bearing_top]);
                bounds([-mast_width/2,5,bearing_low],[mast_width/2,mast_y+mast_depth/2,bearing_top]);
            }
        }
        translate([0,pivot_y,bearing_low-fudge])
            cylinder(d=shaft_d+hole_compensation+2*fit_clearance,h=bearing_h+2*fudge);
        translate([0,pivot_y,bearing_top-stop_depth-fit_clearance])
            linear_extrude(height=stop_depth+fit_clearance+fudge)
                sector_2d(stop_channel_inner,stop_channel_outer,stop_channel_angle);
    }
}
module wire_eye() {
    // Optional loop restraint with a rounded tie path. Use a loose harness loop.
    eye_x=-mast_width/2-1.4;
    eye_z=49;
    difference() {
        translate([eye_x,mast_y,eye_z]) rod_y(5.4,9);
        translate([eye_x,mast_y,eye_z]) rod_y(5.4+2*fudge,4.2+hole_compensation);
    }
}
module tower() {
    uprights = mast_width/2-3;
    difference() {
        union() {
            stem();
            bounds([-mast_width/2,mast_y-mast_depth/2,base_t+socket_h-fudge],
                   [ mast_width/2,mast_y+mast_depth/2,base_t+socket_h+3]);
            for (side=[-1,1])
                mast_strip(side*uprights,base_t+socket_h+2,side*uprights,bearing_low+2,6);
            mast_strip(-uprights,base_t+socket_h+3,uprights,atom_z+2);
            mast_strip(uprights,atom_z+2,-uprights,bearing_low+2);
            dock();
            bearing();
            wire_eye();
        }
        base_key_slot();
        for (x=[-rail_mount_x,rail_mount_x])
            bounds([x-rail_ear/2-fit_clearance,dock_y-fit_clearance,dock_z-fit_clearance],
                   [x+rail_ear/2+fit_clearance,hanger_rear+fit_clearance,dock_z+dock_ear_h+12]);
        // Clear fore tip of upper braces below the yaw bearing; rear web stays.
        bounds([-20,-26,head_key_z-head_key_hi-0.6],[20,6.3,bearing_low]);
        // Socket clearance for the flared shoulder; leave the indexed tenon.
        difference() {
            bounds([-socket_w/2-touch_gap,mast_y-socket_d/2-touch_gap,base_t-fudge],
                   [socket_w/2+touch_gap,mast_y+socket_d/2+touch_gap,base_t+socket_h+touch_gap]);
            stem();
        }
    }
}

module atom_cradle() {
    // Only narrow edge ledges under the case. No web crosses the GPIO region.
    a=atom_width/2;
    for (s=[-1,1]) scale([s,1,1]) {
        bounds([a-atom_lip,atom_front-0.4,dock_z],
               [cradle_outer_w/2,atom_back+fit_clearance+wall,atom_z-touch_gap]);
        difference() {
            bounds([a+fit_clearance,atom_front-0.4,dock_z],
                   [a+fit_clearance+wall+0.85,atom_back+fit_clearance+wall,keeper_z+2*wall+fit_clearance]);
            bounds([a+fit_clearance-fudge,atom_front-0.4-fudge,keeper_z-fit_clearance],
                   [a+fit_clearance+keeper_guide_ear+fit_clearance,atom_back+0.5,keeper_z+wall+fit_clearance]);
            if (s==1) bounds([atom_latch_x-fudge,atom_latch_tooth_y-0.20,keeper_z-fit_clearance],
                 [atom_latch_x+atom_latch_reach+0.25,atom_latch_tooth_y+2.6,keeper_z+wall+fit_clearance]);
        }
        // Flange above the rear dock; rear teeth insert from above.
        bounds([rail_mount_x-rail_ear/2,atom_back+0.55,dock_z+dock_ear_h+touch_gap],
               [rail_mount_x+rail_ear/2,dock_y+0.7,dock_z+dock_ear_h+wall]);
        dock_pocket(rail_mount_x);
        bounds([rail_mount_x-rail_ear/2,dock_y,dock_z],[rail_mount_x+rail_ear/2,dock_y+0.7,dock_z+dock_ear_h+wall]);
        // Short rear locator and front corner fence.
        bounds([a-atom_lip,atom_back+fit_clearance,dock_z],
               [cradle_outer_w/2,atom_back+fit_clearance+wall,atom_z+3]);
        bounds([a-atom_lip,atom_front-fit_clearance-wall,dock_z],
               [a+fit_clearance+wall,atom_front-fit_clearance,atom_z+3]);
        // Corner rail flange captures the keeper edges; open toward the nose.

    }
    bounds([-cradle_outer_w/2,atom_back+fit_clearance,dock_z],
           [cradle_outer_w/2,atom_back+fit_clearance+wall,atom_z+2.8]);
}
module atom_keeper(deflect=0) {
    // Right-side tab is an in-plane cantilever. Push it left, then slide the
    // whole keeper forward. The square edge resists forward extraction.
    a=atom_width/2;
    xa=atom_latch_x;
    xi=a-atom_lip;
    bounds([-xa,tab_y,keeper_z],[xa,atom_back+fit_clearance,keeper_z+wall]);
    bounds([-xa,atom_front+2,keeper_z],[-xi,atom_back+fit_clearance,keeper_z+wall]);
    bounds([xi,atom_latch_root_y-fudge,keeper_z],[xa,atom_back+fit_clearance,keeper_z+wall]);
    bounds([-xa,atom_front+0.8,keeper_z],
           [xa-atom_latch_t-atom_latch_deflect-0.40,atom_front+2+fudge,keeper_z+wall]);
    translate([0,0,keeper_z]) linear_extrude(height=wall)
        polygon([[xa-atom_latch_t-deflect,atom_front-2.2],
                 [xa-deflect,atom_front-2.2],
                 [xa-deflect,atom_latch_tooth_y],
                 [xa+atom_latch_reach-deflect,atom_latch_tooth_y],
                 [xa+atom_latch_reach-deflect,atom_latch_tooth_y+0.45],
                 [xa-deflect*0.8,atom_latch_tooth_y+2.35],
                 [xa,atom_latch_root_y+fudge],
                 [xa-atom_latch_t,atom_latch_root_y+fudge]]);
}

module atom_body() { bounds([-atom_width/2,atom_front,atom_z],[atom_width/2,atom_back,atom_top]); }
module gpio_env() {
    bounds([-atom_width/2+2.6,atom_front+3,atom_z-harness_height],
           [ atom_width/2-2.6,atom_back-1.8,atom_z+fudge]);
}
module usb_env() {
    usb_z=atom_top-2.15;
    bounds([-atom_usb_plug_width/2,atom_front-24,usb_z-atom_usb_plug_height/2],
           [ atom_usb_plug_width/2,atom_front+fudge,usb_z+atom_usb_plug_height/2]);
}
module button_env() {
    bounds([-digit_width/2,atom_y-digit_width/2,atom_top-touch_gap],
           [ digit_width/2,atom_y+digit_width/2,atom_top+9]);
}

module radar_track(fill=0) {
    half_w=radar_width/2;
    at=half_w+fit_clearance;
    e=radar_front_edge_keepout;
    // Tall side rails, foot seats outside the middle connector zone.
    for (s=[-1,1]) scale([s,1,1]) difference() {
        union() {
        bounds([at,radar_y-wall-radar_fit,radar_bottom-wall],
               [at+wall,radar_y+radar_thickness+wall+radar_fit,radar_rail_top]);
        bounds([half_w-e,radar_y-wall-radar_fit,radar_bottom-wall],
               [at+wall,radar_y-radar_fit,radar_rail_top]);
        bounds([half_w-e,radar_y+radar_thickness+radar_fit,radar_bottom-wall],
               [at+wall,radar_y+radar_thickness+wall+radar_fit,radar_rail_top]);
        bounds([half_w-e,radar_y-wall-radar_fit,radar_bottom-wall],
               [at+wall,radar_y+radar_thickness+wall+radar_fit,radar_bottom-touch_gap]);
        if (fill>0) bounds([half_w-e,radar_y-wall-radar_fit,radar_bottom-2.8],
                          [at+wall,radar_y+radar_thickness+wall+radar_fit,radar_bottom-touch_gap]);
        }
        if (s==1)
            bounds([radar_latch_x-1.4,radar_latch_rail_y-radar_latch_reach-0.20,radar_latch_tip_z-0.20],
                   [radar_latch_x+1.4,radar_latch_rail_y+fudge,radar_latch_bite_z+0.20]);
    }
}
module radar_keeper(deflect=0) {
    // A lift-off U cap with two fitted side pockets. Internal ledges sit
    // above the PCB's outer corners and keep the center/antenna open.
    rc=radar_fit*0.72;
    iz=radar_rail_top-3.8;
    midy=radar_y+radar_thickness/2;
    xa=radar_width/2-radar_front_edge_keepout;
    xb=radar_rail_x+wall;
    yl=midy-radar_cap_depth/2;
    yh=midy+radar_cap_depth/2;
    for (side=[-1,1]) scale([side,1,1]) difference() {
        bounds([xa-wall*0.7,yl-radar_cap_wall,iz],
               [xb+radar_cap_wall,yh+radar_cap_wall,radar_rail_top+radar_cap_wall+touch_gap]);
        bounds([xa-rc,yl-rc,iz-fudge],
               [xb+rc,yh+rc,radar_rail_top+touch_gap]);
        // Only the actual board corner stops upwards travel.
        bounds([xa-wall*0.7-fudge,radar_y-radar_fit,iz-fudge],
               [xa+fudge,radar_y+radar_thickness+radar_fit,radar_top+fit_clearance]);
        // Clear the snap tooth and its release path on one side only.
        if (side==1)
            bounds([radar_latch_x-1.6,radar_latch_rail_y-radar_latch_reach-fudge,iz-fudge],
                   [radar_latch_x+1.6,yh+wall+fudge,radar_latch_bite_z+0.45]);
    }
    // Cross-tie sits behind, above the assumed rear component envelope.
    bounds([-xb-wall,yh+0.6,radar_rail_top-fudge],
           [xb+wall,yh+wall,radar_latch_roof]);
    // Place the flexible bar behind the cross-tie. Its top prints on the
    // bed with the cap. The raised rear tab provides a finger grip.
    bar_y=yh+wall+0.60;
    bounds([-0.6,yh+wall-fudge,radar_rail_top-fudge],
           [radar_latch_root_x+fudge,bar_y+radar_latch_t,radar_latch_roof]);
    translate([0,0,radar_rail_top-fudge]) linear_extrude(height=radar_cap_wall+touch_gap+fudge)
        polygon([[radar_latch_root_x,bar_y],
                 [radar_latch_x+1.35,bar_y+deflect],
                 [radar_latch_x+1.35,bar_y+radar_latch_t+deflect],
                 [radar_latch_root_x,bar_y+radar_latch_t]]);
    // A rear claw has a lead-in ramp and a square capture shoulder.
    translate([radar_latch_x-1.25,deflect,0]) rotate([90,0,90])
        linear_extrude(height=2.5)
            polygon([[radar_latch_rail_y+0.10,radar_latch_tip_z],
                     [bar_y+radar_latch_t+0.7,radar_latch_tip_z],
                     [bar_y+radar_latch_t+0.7,radar_latch_roof],
                     [bar_y,radar_latch_roof],
                     [bar_y,radar_latch_bite_z],
                     [radar_latch_rail_y-radar_latch_reach,radar_latch_bite_z]]);
}
module radar_board() {
    bounds([-radar_width/2,radar_y,radar_bottom],[radar_width/2,radar_y+radar_thickness,radar_top]);
}
module radar_connector() {
    bounds([-radar_rear_width/2,radar_y+radar_thickness-fudge,radar_bottom+0.8],
           [radar_rear_width/2,radar_y+radar_thickness+radar_rear_depth,radar_top-0.8]);
}
module radar_rigid_housing() {
    bounds([-radar_connector_width/2,radar_y+radar_thickness-fudge,radar_bottom+radar_connector_bottom],
           [ radar_connector_width/2,radar_exit_local_y,radar_bottom+radar_connector_bottom+radar_connector_height]);
}
module head_key_slot() {
    translate([0,0,2*head_key_z]) mirror([0,0,1])
        key_channel(0,0,head_key_z,head_key_len,head_key_depth,head_key_lo,head_key_hi,head_key_roof_gap);
}
module head_key() { tapered_key(head_key_len,head_key_depth,head_key_lo,head_key_hi,2.8); }
module head_key_at(dx=0) {
    translate([dx,0,head_key_z]) mirror([0,0,1]) head_key();
}
module head() {
    difference() {
        union() {
            translate([0,0,shaft_low]) cylinder(d=shaft_d,h=deck_z-shaft_low+fudge);
            translate([0,0,deck_z]) cylinder(r=head_disk_r,h=2.05);
            bounds([stop_r-stop_radial/2,-stop_tangent/2,bearing_top-stop_depth+touch_gap],
                   [stop_r+stop_radial/2,stop_tangent/2,deck_z+fudge]);
            radar_track(1);
        }
        head_key_slot();
    }
}
module head_pose(a=0,dz=0) {
    translate([0,pivot_y,dz]) rotate([0,0,a]) children();
}
module section_bar(a,b,d) { hull() { translate(a) sphere(d=d); translate(b) sphere(d=d); } }
// A representative rear slack loop; reshape this envelope for a real cable.
module wire_loop(a) {
    pts=route(a);
    for (i=[0:len(pts)-2]) section_bar(pts[i],pts[i+1],jumper_bundle_diameter);
}
module fit_coupon() {
    // Radar rails, Atom rim/keeper track and both keyed receivers.
    // Pair with the production head, keys and keepers as needed. The
    // bearing bore is off the plate with room for the spindle/key.
    union() {
        translate([0,0,2-radar_bottom+wall-fudge]) radar_track();
        translate([0,radar_y-0.5,0]) flat_base(29,8,1,2);
        translate([0,-21,2-dock_z-fudge]) atom_cradle();
        translate([0,-36,0]) flat_base(34,34,2,2);
        translate([33,-mast_y,2-base_t-fudge]) socket();
        translate([33,0,0]) flat_base(34,17,1,2);
        translate([33,-37,8-bearing_low]) bearing();
        translate([33,-32,0]) flat_base(34,13,1,2);
        translate([33,-30.5,0]) bounds([-9,1.7,1.9],[9,5,8.05]);
        bounds([-3,-21,0],[4,radar_y-2,2]);
        bounds([10,-36,0],[23,-32,2]);
        bounds([29,-28,0],[38,-4,2]);
        bounds([8,-2,0],[21,1,2]);
    }
}
module assembly(clamped=false, exploded=false) {
    e=exploded?1:0;
    color("#283740") if (clamped) clamp(); else stand();
    if (clamped) {
        color("#d4823b") translate([-26*e,0,0]) wedge_use();
        if (show_hardware && !exploded) color([0.72,0.55,0.42,0.34]) shelf();
    }
    color("#52778b") translate([0,0,8*e]) tower();
    color("#d4823b") translate([-31*e,0,0]) base_key_use();
    color("#c99650") translate([0,-22*e,8*e]) atom_cradle();
    color("#d4823b") translate([0,-18*e,16*e]) atom_keeper();
    color("#52778b") head_pose(yaw,20*e) head();
    color("#d4823b") head_pose(yaw,33*e) radar_keeper();
    color("#d4823b") head_pose(yaw,14*e) head_key_at(-25*e);
    if (show_hardware) {
        color("#1e2126") translate([0,-20*e,14*e]) atom_body();
        color("#eadfce") translate([0,-20*e,14*e])
            bounds([-6.5,atom_y-6.5,atom_top-fudge],[6.5,atom_y+6.5,atom_top+0.45]);
        color("#354f39") head_pose(yaw,25*e) radar_board();
        color("#2c3032") head_pose(yaw,25*e) radar_rigid_housing();
        color("#b68a42") head_pose(yaw,25*e)
            bounds([-radar_width/2+2,radar_y-fudge,radar_top-8],
                   [radar_width/2-2,radar_y+fudge,radar_top-1.8]);
        if (!exploded) color("#47474a") wire_loop(yaw);
    }
}
// === ASSEMBLY / RENDER ===
if (part=="tower") translate([0,0,mast_y+mast_depth/2]) rotate([-90,0,0]) tower();
if (part=="head") translate([0,0,-shaft_low]) head();
if (part=="radar_keeper") translate([0,0,radar_rail_top+radar_cap_wall+touch_gap]) rotate([180,0,0]) radar_keeper();
if (part=="atom_cradle") translate([0,0,-dock_z]) atom_cradle();
if (part=="atom_keeper") translate([0,0,-keeper_z]) atom_keeper();
if (part=="stand") stand();
if (part=="clamp") translate([0,0,clamp_width/2]) rotate([0,90,0]) clamp();
if (part=="clamp_wedge") translate([0,0,wedge_z]) rotate([180,0,0]) wedge_use();
if (part=="base_key") tapered_key(base_key_len,base_key_depth,base_key_lo,base_key_hi);
if (part=="head_key") head_key();
if (part=="fit_coupon") fit_coupon();
if (part=="assembly_stand") assembly();
if (part=="assembly_clamp") assembly(true);
if (part=="explode_stand") assembly(false,true);
if (part=="explode_clamp") assembly(true,true);
if (part=="clash_stand_tower") intersection() { stand(); tower(); }
if (part=="clash_clamp_tower") intersection() { clamp(); tower(); }
if (part=="clash_base_insertion") for (dz=[1:1:13]) intersection() {
    translate([0,0,dz]) tower(); union() { stand(); clamp(); }
}
if (part=="clash_base_key") for (dx=[-18,-10,0]) intersection() {
    base_key_use(dx); union() { stand(); clamp(); tower(); }
}
// Near-contact checks leave a small numerical gap on the intended bearing faces.
if (part=="clash_base_key_near_preload") intersection() {
    translate([0,0,fudge-base_key_bottom_gap])
        base_key_use(base_key_take_up-2*fudge/base_key_slope);
    union() { stand(); clamp(); tower(); }
}
if (part=="clash_head_sweep") for (a=motion_angles) intersection() {
    tower(); head_pose(a) head();
}
if (part=="clash_head_insertion") for (dz=[1:1:13]) intersection() {
    tower(); head_pose(0,dz) head();
}
if (part=="clash_head_key") for (a=motion_angles, dx=(a==0 ? [-10,-5,0] : [0])) intersection() {
    head_pose(a) head_key_at(dx); union() { tower(); head_pose(a) head(); }
}
if (part=="clash_head_key_near_preload") for (a=motion_angles) intersection() {
    head_pose(a,head_key_axial_gap-fudge)
        head_key_at(head_key_take_up-4*fudge/head_key_slope);
    union() { tower(); head_pose(a,fudge-head_deck_gap) head(); }
}
if (part=="clash_radar") intersection() { head(); union() { radar_board(); radar_connector(); radar_rigid_housing(); } }
if (part=="clash_radar_insertion") intersection() {
    head(); union() {
        hull() { radar_board(); translate([0,0,radar_height+2]) radar_board(); }
        hull() { radar_connector(); translate([0,0,radar_height+2]) radar_connector(); }
        hull() { radar_rigid_housing(); translate([0,0,radar_height+2]) radar_rigid_housing(); }
    }
}
if (part=="clash_radar_keeper") for (dz=[0,0.3,1,2,3,4,6]) intersection() {
    translate([0,0,dz]) radar_keeper(dz==0 ? 0 : radar_latch_deflect);
    union() { head(); radar_board(); radar_connector(); radar_rigid_housing(); }
}
if (part=="check_radar_latch_lock") intersection() {
    translate([0,0,0.65]) radar_keeper();
    head();
}
if (part=="clash_atom") intersection() {
    atom_body(); union() { atom_cradle(); atom_keeper(); tower(); }
}
if (part=="clash_atom_insertion") intersection() {
    hull() { atom_body(); translate([0,0,12]) atom_body(); } union() { atom_cradle(); tower(); }
}
if (part=="clash_atom_keeper") for (dy=[0,-0.3,-1,-2,-5,-10,-20]) intersection() {
    translate([0,dy,0]) atom_keeper(dy==0 ? 0 : atom_latch_deflect);
    union() { tower(); atom_body(); atom_cradle(); }
}
if (part=="check_atom_latch_lock") intersection() {
    translate([0,-0.65,0]) atom_keeper();
    atom_cradle();
}
if (part=="clash_atom_dock") intersection() { atom_cradle(); tower(); }
if (part=="clash_atom_dock_insertion") for (dz=[1,4,9]) intersection() {
    translate([0,0,dz]) atom_cradle(); tower();
}
if (part=="clash_usb") intersection() { usb_env(); union() { atom_cradle(); atom_keeper(); tower(); } }
if (part=="clash_gpio") intersection() { gpio_env(); union() { atom_cradle(); tower(); clamp(); stand(); } }
if (part=="clash_button") intersection() { button_env();
    union() { atom_keeper(); atom_cradle(); tower(); for (a=motion_angles) head_pose(a) { head(); head_key_at(); } } }
if (part=="clash_wires") for (a=motion_angles) intersection() {
    wire_loop(a); union() { tower(); head_pose(a) head(); }
}
if (part=="clash_shelf") intersection() { shelf(); union() { clamp(); wedge_use(); } }
if (part=="clash_wedge") intersection() { clamp(); wedge_use(); }
if (part=="clash_wedge_insertion") for (dx=[-40,-30,-20,-wedge_adjustment,0]) intersection() {
    wedge_use(dx); union() { clamp(); shelf(); }
}

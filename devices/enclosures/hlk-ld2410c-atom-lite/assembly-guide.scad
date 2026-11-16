include <enclosure.scad>
scene="stand";
module assembly_v5(c=false) {
 color("#86969e") if(c) clamp(); else stand();
 if(c) color("#df853d") wedge_use();
 color("#4b7f9b") tower();
 color("#df853d") atom_cradle();
 color("#eeb25e") atom_keeper();
 color("#33383d") atom_body();
 color("#e7e4dd") bounds([-6.5,atom_y-6.5,atom_top],[6.5,atom_y+6.5,atom_top+.45]);
 color("#86969e") head_pose(0) head();
 color("#df853d") head_pose(0) head_key_at(0);
 color("#eee4ce") head_pose(0) radar_keeper();
 color("#538253") head_pose(0) radar_board();
 color("#ac7c47") head_pose(0) bounds([-radar_width/2+2,radar_y-.02,radar_top-8],[radar_width/2-2,radar_y+.02,radar_top-1.8]);
 color("#865da2") wire_loop(0);
 color("#449fa8") bounds([-5,atom_back,atom_z+2],[5,atom_back+30,atom_z+7]);
}
if(scene=="stand") assembly_v5();
if(scene=="clamp") assembly_v5(true);
if(scene=="rear") assembly_v5(true);
if(scene=="dock") {
 color("#4b7f9b") tower();
 translate([0,0,dock_lift+1]) {
 color("#df853d") atom_cradle();
 color("#eeb25e") atom_keeper();
 color("#33383d") atom_body();
 color("#e7e4dd") bounds([-6.5,atom_y-6.5,atom_top],[6.5,atom_y+6.5,atom_top+.45]);
 color("#449fa8") bounds([-5,atom_back,atom_z+2],[5,atom_back+30,atom_z+7]);
 }
}

import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


VIEWS = {
    "front": Vector((0.0, -1.0, 0.0)),
    "back": Vector((0.0, 1.0, 0.0)),
    "left": Vector((-1.0, 0.0, 0.0)),
    "right": Vector((1.0, 0.0, 0.0)),
    "top": Vector((0.0, 0.0, 1.0)),
    "bottom": Vector((0.0, 0.0, -1.0)),
    "isometric": Vector((1.0, -1.0, 1.0)),
}

BACKGROUND_RGBA = (0.15, 0.16, 0.18, 1.0)


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Render 7-view snapshots directly from STEP/STP in Blender.")
    parser.add_argument("--input", required=True, help="Path to STEP/STP file")
    parser.add_argument("--output_dir", required=True, help="Directory for output PNG snapshots")
    parser.add_argument("--size", type=int, default=512, help="Output image size")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.curves:
        bpy.data.curves.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def enable_addon_if_present(module_name):
    try:
        import addon_utils

        addon_utils.enable(module_name, default_set=False, persistent=False)
        return True
    except Exception:
        return False


def import_step(step_path):
    # Try common STEP add-ons/operators seen across Blender/plugin variants.
    addon_candidates = ["io_import_step", "import_step", "io_scene_step"]
    for addon in addon_candidates:
        enable_addon_if_present(addon)

    if hasattr(bpy.ops.wm, "step_import"):
        bpy.ops.wm.step_import(filepath=step_path)
        return

    if hasattr(bpy.ops.import_scene, "step"):
        bpy.ops.import_scene.step(filepath=step_path)
        return

    raise RuntimeError(
        "No STEP import operator available in Blender. Install/enable a STEP importer add-on "
        "(for example io_import_step/STEPper), then rerun."
    )


def to_mesh_and_cleanup():
    objs = [obj for obj in bpy.context.scene.objects if obj.type in {"MESH", "CURVE", "SURFACE", "META", "FONT"}]
    if not objs:
        raise RuntimeError("No geometry objects found after STEP import.")

    for obj in objs:
        bpy.ops.object.select_all(action="DESELECT")
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj

        if obj.type != "MESH":
            bpy.ops.object.convert(target="MESH")

        mesh_obj = bpy.context.view_layer.objects.active
        if mesh_obj and mesh_obj.type == "MESH":
            bpy.ops.object.shade_smooth()
            mesh_obj.data.use_auto_smooth = True
            mesh_obj.data.auto_smooth_angle = math.radians(35)


def mesh_objects():
    return [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]


def scene_bbox(objects):
    min_corner = Vector((math.inf, math.inf, math.inf))
    max_corner = Vector((-math.inf, -math.inf, -math.inf))

    for obj in objects:
        for vertex in obj.bound_box:
            world = obj.matrix_world @ Vector(vertex)
            min_corner.x = min(min_corner.x, world.x)
            min_corner.y = min(min_corner.y, world.y)
            min_corner.z = min(min_corner.z, world.z)
            max_corner.x = max(max_corner.x, world.x)
            max_corner.y = max(max_corner.y, world.y)
            max_corner.z = max(max_corner.z, world.z)

    return min_corner, max_corner


def center_and_scale(objects):
    min_corner, max_corner = scene_bbox(objects)
    center = (min_corner + max_corner) * 0.5
    dims = max_corner - min_corner
    max_dim = max(dims.x, dims.y, dims.z, 0.001)

    for obj in objects:
        obj.location -= center

    return max_dim


def setup_world():
    scene = bpy.context.scene
    available_engines = {item.identifier for item in scene.render.bl_rna.properties["engine"].enum_items}
    if "BLENDER_EEVEE_NEXT" in available_engines:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    elif "BLENDER_EEVEE" in available_engines:
        scene.render.engine = "BLENDER_EEVEE"
    else:
        scene.render.engine = "CYCLES"

    world = scene.world
    if world is None:
        world = bpy.data.worlds.new("World")
        scene.world = world

    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = BACKGROUND_RGBA
        bg.inputs[1].default_value = 1.0


def setup_studio_lights():
    bpy.ops.object.light_add(type="AREA", location=(4.5, -5.5, 6.0))
    key = bpy.context.object
    key.data.energy = 1400.0
    key.data.size = 4.0

    bpy.ops.object.light_add(type="AREA", location=(-5.5, 4.0, 4.5))
    fill = bpy.context.object
    fill.data.energy = 600.0
    fill.data.size = 6.0

    bpy.ops.object.light_add(type="AREA", location=(0.0, 6.0, 5.0))
    back = bpy.context.object
    back.data.energy = 800.0
    back.data.size = 4.5


def setup_camera(size, ortho_scale):
    scene = bpy.context.scene
    bpy.ops.object.camera_add(location=(0.0, -4.0, 2.8))
    cam = bpy.context.object
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = ortho_scale
    cam.data.clip_start = 0.001
    cam.data.clip_end = 10000.0
    scene.camera = cam

    scene.render.resolution_x = size
    scene.render.resolution_y = size
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGB"

    return cam


def render_views(camera, output_dir, distance):
    scene = bpy.context.scene
    target = Vector((0.0, 0.0, 0.0))

    for view_name, direction in VIEWS.items():
        camera.location = direction.normalized() * distance
        facing = target - camera.location
        camera.rotation_euler = facing.to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(output_dir, f"{view_name}.png")
        bpy.ops.render.render(write_still=True)


def main():
    args = parse_args()

    input_path = os.path.abspath(args.input)
    output_dir = os.path.abspath(args.output_dir)
    os.makedirs(output_dir, exist_ok=True)

    clear_scene()
    import_step(input_path)
    to_mesh_and_cleanup()

    objects = mesh_objects()
    if not objects:
        raise RuntimeError("No mesh objects found after conversion.")

    max_dim = center_and_scale(objects)
    size = max(args.size, 128)

    setup_world()
    setup_studio_lights()

    ortho_scale = max_dim * 1.65
    distance = max_dim * 3.2
    camera = setup_camera(size, ortho_scale)
    render_views(camera, output_dir, distance)

    print(f"Rendered 7 snapshots to: {output_dir}")


if __name__ == "__main__":
    main()

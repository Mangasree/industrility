import argparse
import math
import os
import sys

import bpy
from mathutils import Vector


VIEWS = {
    "top": Vector((0.0, 0.0, 1.0)),
    "bottom": Vector((0.0, 0.0, -1.0)),
    "left": Vector((-1.0, 0.0, 0.0)),
    "right": Vector((1.0, 0.0, 0.0)),
    "front": Vector((0.0, -1.0, 0.0)),
    "back": Vector((0.0, 1.0, 0.0)),
    "isometric": Vector((1.0, -1.0, 1.0)),
}

BACKGROUND_RGBA = (0.129, 0.129, 0.133, 1.0)  # Ink Black (#212122)


def parse_args():
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []

    parser = argparse.ArgumentParser(description="Render 7-view snapshots for one CAD file.")
    parser.add_argument("--input", required=True, help="Path to CAD file")
    parser.add_argument("--output_dir", required=True, help="Directory for output PNG files")
    parser.add_argument("--size", type=int, default=512, help="Render size (square)")
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)


def import_mesh(input_path):
    ext = os.path.splitext(input_path)[1].lower()

    if ext == ".stl":
        try:
            import addon_utils

            addon_utils.enable("io_mesh_stl", default_set=False, persistent=False)
        except Exception:
            pass

        if hasattr(bpy.ops.wm, "stl_import"):
            bpy.ops.wm.stl_import(filepath=input_path)
            return

        if hasattr(bpy.ops.import_mesh, "stl"):
            bpy.ops.import_mesh.stl(filepath=input_path)
            return

        raise RuntimeError("No STL import operator available in this Blender build.")
        return

    if ext == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=input_path)
            return

        bpy.ops.import_scene.obj(filepath=input_path)
        return

    raise RuntimeError(f"Unsupported renderer input extension in Blender script: {ext}")


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


def center_objects(objects):
    min_corner, max_corner = scene_bbox(objects)
    center = (min_corner + max_corner) * 0.5
    for obj in objects:
        obj.location -= center
    return center


def max_dimension(objects):
    min_corner, max_corner = scene_bbox(objects)
    dims = max_corner - min_corner
    return max(dims.x, dims.y, dims.z)


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


def setup_lights():
    bpy.ops.object.light_add(type="SUN", location=(4.0, -4.0, 6.0))
    key = bpy.context.object
    key.data.energy = 3.0

    bpy.ops.object.light_add(type="AREA", location=(-4.0, 4.0, 4.0))
    fill = bpy.context.object
    fill.data.energy = 500.0
    fill.data.size = 8.0


def setup_camera(size, ortho_scale):
    scene = bpy.context.scene
    bpy.ops.object.camera_add(location=(0.0, -4.0, 2.5))
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
    import_mesh(input_path)
    objects = mesh_objects()
    if not objects:
        raise RuntimeError("No mesh objects found after import.")

    center_objects(objects)
    size = max(args.size, 64)
    object_max_dim = max(max_dimension(objects), 0.001)
    ortho_scale = object_max_dim * 1.6
    distance = object_max_dim * 3.0

    setup_world()
    setup_lights()
    cam = setup_camera(size, ortho_scale)
    render_views(cam, output_dir, distance)
    print(f"Rendered 7 views to {output_dir}")


if __name__ == "__main__":
    main()

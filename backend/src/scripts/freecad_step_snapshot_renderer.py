import os
import sys
import traceback


VIEWS = [
    ("top", "viewTop", []),
    ("bottom", "viewBottom", []),
    ("left", "viewLeft", []),
    ("right", "viewRight", []),
    ("front", "viewFront", []),
    ("back", "viewRear", []),
    ("isometric", "viewAxonometric", []),
]

# High-quality display tessellation for cleaner curved edges in snapshots.
HQ_DEVIATION = 0.03
HQ_ANGULAR_DEFLECTION = 5.0
MIN_VALID_PNG_SIZE_BYTES = 4000


def _iter_children(obj):
    children = []
    group = getattr(obj, "Group", None)
    if group:
        children.extend(group)
    out_list = getattr(obj, "OutList", None)
    if out_list:
        children.extend(out_list)
    return children


def get_shape_objects(doc):
    shape_objects = []
    seen = set()
    stack = list(doc.Objects)

    while stack:
        obj = stack.pop()
        if obj is None:
            continue
        key = getattr(obj, "Name", None) or id(obj)
        if key in seen:
            continue
        seen.add(key)

        shape = getattr(obj, "Shape", None)
        if shape is not None:
            try:
                if not shape.isNull():
                    bb = shape.BoundBox
                    if bb is not None and bb.DiagonalLength > 0:
                        shape_objects.append(obj)
            except Exception:
                pass

        stack.extend(_iter_children(obj))

    return shape_objects


def recenter_model(doc):
    import FreeCAD

    shape_objects = get_shape_objects(doc)
    if not shape_objects:
        return False

    min_x = min_y = min_z = float("inf")
    max_x = max_y = max_z = float("-inf")

    for obj in shape_objects:
        bb = obj.Shape.BoundBox
        min_x = min(min_x, bb.XMin)
        min_y = min(min_y, bb.YMin)
        min_z = min(min_z, bb.ZMin)
        max_x = max(max_x, bb.XMax)
        max_y = max(max_y, bb.YMax)
        max_z = max(max_z, bb.ZMax)

    dx = max_x - min_x
    dy = max_y - min_y
    dz = max_z - min_z
    if max(dx, dy, dz) <= 0:
        return False

    center = FreeCAD.Vector((min_x + max_x) * 0.5, (min_y + max_y) * 0.5, (min_z + max_z) * 0.5)
    shift = FreeCAD.Vector(-center.x, -center.y, -center.z)

    moved_any = False
    for obj in shape_objects:
        placement = getattr(obj, "Placement", None)
        if placement is None:
            continue
        try:
            obj.Placement.Base = obj.Placement.Base.add(shift)
            moved_any = True
        except Exception:
            pass

    if moved_any:
        doc.recompute()
    return moved_any


def set_background_color():
    import FreeCAD

    # Ink-black background with no gradient.
    p = FreeCAD.ParamGet("User parameter:BaseApp/Preferences/View")
    p.SetUnsigned("BackgroundColor", int("212122", 16))
    p.SetUnsigned("BackgroundColor2", int("212122", 16))
    p.SetUnsigned("BackgroundColor3", int("212122", 16))
    p.SetUnsigned("BackgroundColor4", int("212122", 16))
    p.SetBool("Simple", True)
    p.SetBool("UseGradientBackground", False)
    p.SetInt("AntiAliasing", 8)


def apply_high_quality_view_settings(doc):
    for obj in doc.Objects:
        view_obj = getattr(obj, "ViewObject", None)
        if view_obj is None:
            continue

        # Lower deviation / angular deflection gives a denser display mesh.
        if hasattr(view_obj, "Deviation"):
            view_obj.Deviation = HQ_DEVIATION
        if hasattr(view_obj, "AngularDeflection"):
            view_obj.AngularDeflection = HQ_ANGULAR_DEFLECTION

        if hasattr(view_obj, "DisplayMode"):
            try:
                view_obj.DisplayMode = "Shaded"
            except Exception:
                pass


def get_rotate_callable(view, direction):
    direction = direction.lower()
    candidates = {
        "left": ["viewRotateLeft", "rotateLeft"],
        "right": ["viewRotateRight", "rotateRight"],
        "up": ["viewRotateUp", "rotateUp"],
        "down": ["viewRotateDown", "rotateDown"],
    }.get(direction, [])

    for name in candidates:
        fn = getattr(view, name, None)
        if callable(fn):
            return fn
    return None


def render_all_views(FreeCADGui, view, output_dir, size):
    for view_name, method_name, rotate_steps in VIEWS:
        method = getattr(view, method_name, None)
        if method is None:
            raise RuntimeError(f"View method not available in FreeCAD: {method_name}")
        method()
        for rotate_direction, rotate_count in rotate_steps:
            rotate_fn = get_rotate_callable(view, rotate_direction)
            if rotate_fn is None:
                print(f"WARN: No camera rotate method found for direction={rotate_direction}; view={view_name}")
                continue
            for _ in range(max(1, int(rotate_count))):
                rotate_fn()
        view.fitAll()
        FreeCADGui.SendMsgToActiveView("ViewFit")
        if hasattr(FreeCADGui, "updateGui"):
            FreeCADGui.updateGui()
        output_path = os.path.join(output_dir, f"{view_name}.png")
        view.saveImage(output_path, size, size, "Current")


def outputs_look_blank(output_dir):
    sizes = []
    for view_name, _, _ in VIEWS:
        output_path = os.path.join(output_dir, f"{view_name}.png")
        if not os.path.exists(output_path):
            return True
        sizes.append(os.path.getsize(output_path))
    return all(sz < MIN_VALID_PNG_SIZE_BYTES for sz in sizes)


def clear_document(doc):
    for obj in list(doc.Objects):
        try:
            doc.removeObject(obj.Name)
        except Exception:
            pass
    doc.recompute()


def import_step_with_part_read(doc, input_path):
    import Part

    shape = Part.Shape()
    shape.read(input_path)
    obj = doc.addObject("Part::Feature", "StepShape")
    obj.Shape = shape
    doc.recompute()
    return obj


def main():
    args = sys.argv[1:]
    if args and args[0].lower().endswith(".py"):
        args = args[1:]

    if len(args) < 3:
        raise RuntimeError("Usage: freecad_step_snapshot_renderer.py <input.step> <output_dir> <size>")

    input_path = os.path.abspath(args[0])
    output_dir = os.path.abspath(args[1])
    size = int(args[2])
    os.makedirs(output_dir, exist_ok=True)

    import FreeCAD
    import FreeCADGui
    import ImportGui

    if hasattr(FreeCADGui, "showMainWindow"):
        FreeCADGui.showMainWindow()
    set_background_color()

    doc = FreeCAD.newDocument("SnapshotDoc")
    ImportGui.insert(input_path, doc.Name)
    FreeCAD.ActiveDocument.recompute()

    # Fallback for STEP assemblies where insert() creates a document tree
    # without directly discoverable shape geometry.
    if len(get_shape_objects(doc)) == 0:
        try:
            FreeCAD.closeDocument(doc.Name)
        except Exception:
            pass
        ImportGui.open(input_path)
        doc = FreeCAD.ActiveDocument
        if doc is None:
            raise RuntimeError("Failed to open STEP document for rendering.")
        doc.recompute()

    recentered = recenter_model(doc)
    if not recentered:
        print("WARN: Could not recenter model from shape bounds; continuing with default placement.")
    apply_high_quality_view_settings(doc)
    FreeCAD.ActiveDocument.recompute()

    gui_doc = FreeCADGui.ActiveDocument
    if gui_doc is None:
        gui_doc = FreeCADGui.getDocument(doc.Name)

    if gui_doc is None:
        raise RuntimeError("FreeCAD GUI document is not available for rendering.")

    view = gui_doc.ActiveView
    view.setCameraType("Orthographic")

    render_all_views(FreeCADGui, view, output_dir, size)

    # Some STEP assemblies import as non-visible document structures via ImportGui.
    # If all outputs are tiny/blank, fallback to direct Part shape loading.
    if outputs_look_blank(output_dir):
        print("WARN: Initial render appears blank. Retrying with Part.read() fallback.")
        clear_document(doc)
        import_step_with_part_read(doc, input_path)
        recentered = recenter_model(doc)
        if not recentered:
            print("WARN: Part.read() fallback could not recenter model.")
        apply_high_quality_view_settings(doc)
        FreeCAD.ActiveDocument.recompute()
        render_all_views(FreeCADGui, view, output_dir, size)

    FreeCAD.closeDocument(doc.Name)
    print(f"Rendered {len(VIEWS)} STEP snapshots to {output_dir}")
    sys.stdout.flush()
    sys.stderr.flush()
    # FreeCAD.exe can keep GUI/event loop alive after script end on Windows.
    # Force process exit so the parent ingestion script can continue.
    os._exit(0)


try:
    main()
except Exception:
    traceback.print_exc()
    sys.exit(1)

"""Pure geometry checks; does not claim to execute Blender's scene/export APIs."""
import math
from pathlib import Path
import runpy
import unittest

tool = runpy.run_path(str(Path(__file__).resolve().parents[1] / "scripts/blender/add_npc_colliders.py"), run_name="npc_capsule_test")


class CapsuleGeometryTest(unittest.TestCase):
    def test_dimensions_closed_edges_and_outward_winding(self):
        for scale in (0.01, 1, 100):
            radius, height = .3 * scale, 1.8 * scale
            vertices, faces = tool["capsule_geometry"](radius, height)
            self.assertAlmostEqual(max(p[2] for p in vertices) - min(p[2] for p in vertices), height)
            self.assertAlmostEqual(max(math.hypot(p[0], p[1]) for p in vertices), radius)
            self.assertLess(len(vertices), 128)
            edges = {}
            for face in faces:
                for a, b in zip(face, (*face[1:], face[0])):
                    edges.setdefault(tuple(sorted((a, b))), []).append((a, b))
                a, b, c = [vertices[i] for i in face[:3]]
                u = [b[i] - a[i] for i in range(3)]
                v = [c[i] - a[i] for i in range(3)]
                normal = (u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0])
                center = [sum(vertices[j][i] for j in face) / len(face) for i in range(3)]
                self.assertGreater(sum(normal[i] * center[i] for i in range(3)), 0)
            for uses in edges.values():
                self.assertEqual(len(uses), 2)
                self.assertEqual(uses[0], tuple(reversed(uses[1])))

    def test_invalid_dimensions_are_rejected_before_scene_edits(self):
        for radius, height in ((0, 2), (-1, 2), (1, 1), (math.nan, 2), (.3, math.inf)):
            with self.assertRaises(ValueError):
                tool["capsule_geometry"](radius, height)


if __name__ == "__main__":
    unittest.main()

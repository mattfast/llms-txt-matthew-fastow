import unittest

from app.services.llms_generator import diff_summary
from app.services.merkle import LeafDiff, MerkleTree, hash_content


class MerkleDiffTests(unittest.TestCase):
    def test_diff_leaves_categorizes_added_removed_modified(self):
        old = MerkleTree(
            {
                "/a": hash_content("old a"),
                "/b": hash_content("same b"),
                "/c": hash_content("old c"),
            }
        )
        new = MerkleTree(
            {
                "/a": hash_content("new a"),
                "/b": hash_content("same b"),
                "/d": hash_content("new d"),
            }
        )

        diff = old.diff_leaves(new)

        self.assertEqual(diff.modified, {"/a"})
        self.assertEqual(diff.added, {"/d"})
        self.assertEqual(diff.removed, {"/c"})
        self.assertEqual(diff.all_paths, {"/a", "/c", "/d"})

    def test_changed_leaf_paths_is_union_of_all_categories(self):
        old = MerkleTree({"/a": hash_content("old"), "/b": hash_content("gone")})
        new = MerkleTree({"/a": hash_content("new"), "/c": hash_content("fresh")})

        self.assertEqual(old.changed_leaf_paths(new), {"/a", "/b", "/c"})

    def test_identical_trees_have_no_diff(self):
        tree = MerkleTree({"/a": hash_content("x"), "/b": hash_content("y")})
        other = MerkleTree({"/a": hash_content("x"), "/b": hash_content("y")})

        diff = tree.diff_leaves(other)

        self.assertEqual(diff.all_paths, set())


class DiffSummaryTests(unittest.TestCase):
    def test_removed_pages_never_inflate_changed_count(self):
        # Regression test for "150 of 100 pages changed": removed paths must be reported
        # separately, and the total pages tracked must reflect only the current page count.
        diff = LeafDiff(modified={f"/m{i}" for i in range(70)}, added=set(), removed={f"/r{i}" for i in range(80)})

        summary = diff_summary(diff, total_pages=100)

        self.assertIn("70 modified", summary)
        self.assertIn("80 removed", summary)
        self.assertIn("100 pages currently tracked", summary)
        self.assertNotIn("150 of 100", summary)

    def test_no_changes(self):
        self.assertEqual(
            diff_summary(LeafDiff(), total_pages=10),
            "No content changes detected since the last check.",
        )

    def test_added_only(self):
        diff = LeafDiff(added={"/new"})

        summary = diff_summary(diff, total_pages=5)

        self.assertIn("1 added", summary)
        self.assertNotIn("modified", summary)
        self.assertNotIn("removed", summary)


if __name__ == "__main__":
    unittest.main()

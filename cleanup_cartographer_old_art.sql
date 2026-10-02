-- Remove The Cartographer's leftover clothing-era art rows (2026-10-02).
-- The 8 files they point to were never uploaded; nothing else references these rows.
-- Her character stays. Once these are gone she shows "Coming soon" and
-- pledging is paused until new art (a pose with a figure) is added.

delete from public.ds_character_poses
 where id in ('685e5d60-3221-4a41-90fc-3dd4e6e65ba2',
              '15593c90-3ccd-4774-bca3-8898b372aab2')
   and character_id = '05fbc032-07fd-4832-bb7f-81ba14211057';

delete from public.ds_character_expressions
 where id in ('9604dcdd-d59a-4f90-9f81-bf713d77d1e5',
              '1bb0ad09-8c6f-4fdd-a78e-83bf430e03ba',
              'bbcd0367-be21-4481-b67e-cb7b12b2513b',
              '94a9602d-bb57-4059-bb92-5f949890f322');

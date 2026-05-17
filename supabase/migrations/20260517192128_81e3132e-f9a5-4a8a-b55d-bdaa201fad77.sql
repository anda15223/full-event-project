INSERT INTO festival_staff (festival_id, name, role, home_location, confirmed, staff_source)
SELECT id, 'Marius', 'management', 'Copenhagen', true, 'soborg' FROM festivals WHERE slug='jelling-2026'
UNION ALL
SELECT id, 'Alexandra', 'management', 'Copenhagen', true, 'soborg' FROM festivals WHERE slug='jelling-2026';
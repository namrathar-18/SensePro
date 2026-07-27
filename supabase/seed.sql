-- SensePro+ seed data — 4MCA-B class roster (53 students).
-- Run AFTER migrations 0001..0007 in the Supabase SQL editor.
-- Idempotent: re-running upserts the same rows (reg_no / device_key unique).

-- 1) Students -------------------------------------------------------------
insert into students (reg_no, full_name, class_section, seat_zone) values
  ('2547201', 'Aadharsh Krishnaa G', '4MCA-B', 'front'),
  ('2547203', 'Abhinav Jain', '4MCA-B', 'mid'),
  ('2547204', 'Aimee Susan Joseph', '4MCA-B', 'back'),
  ('2547205', 'Ajanya Vinayan', '4MCA-B', 'front'),
  ('2547206', 'Akashdeep Dey', '4MCA-B', 'mid'),
  ('2547208', 'Alan Sojan', '4MCA-B', 'back'),
  ('2547209', 'Albin Thomas', '4MCA-B', 'front'),
  ('2547210', 'Alok Tayal', '4MCA-B', 'mid'),
  ('2547211', 'Amogh Venkat D', '4MCA-B', 'back'),
  ('2547212', 'Anaamika KS', '4MCA-B', 'front'),
  ('2547213', 'Angel Blessy', '4MCA-B', 'mid'),
  ('2547216', 'Annette Elizabeth Shoney', '4MCA-B', 'back'),
  ('2547217', 'Annie Neena A.A', '4MCA-B', 'front'),
  ('2547218', 'B K Vishnu', '4MCA-B', 'mid'),
  ('2547219', 'Bhavya Dhanuka', '4MCA-B', 'back'),
  ('2547220', 'Dinu Devees George', '4MCA-B', 'front'),
  ('2547221', 'Ekta Singh', '4MCA-B', 'mid'),
  ('2547222', 'Emima J', '4MCA-B', 'back'),
  ('2547223', 'Enrita Fernandes', '4MCA-B', 'front'),
  ('2547224', 'Evan John Mathew', '4MCA-B', 'mid'),
  ('2547225', 'Evana Joseph', '4MCA-B', 'back'),
  ('2547226', 'Hanna Joshy', '4MCA-B', 'front'),
  ('2547227', 'Blessy I', '4MCA-B', 'mid'),
  ('2547228', 'Jai Pareek', '4MCA-B', 'back'),
  ('2547229', 'Karun Nagaraj', '4MCA-B', 'front'),
  ('2547230', 'Kuheli Begum', '4MCA-B', 'mid'),
  ('2547231', 'Kunnal', '4MCA-B', 'back'),
  ('2547232', 'Mahamat Tahir Souleymane', '4MCA-B', 'front'),
  ('2547233', 'Mohammed Rehan', '4MCA-B', 'mid'),
  ('2547234', 'Namratha R', '4MCA-B', 'back'),
  ('2547236', 'Nirupama Vincent', '4MCA-B', 'front'),
  ('2547237', 'Omkaar Chakraborty', '4MCA-B', 'mid'),
  ('2547238', 'Paavan Gupta', '4MCA-B', 'back'),
  ('2547239', 'Prajwal K T', '4MCA-B', 'front'),
  ('2547240', 'Pranav MR', '4MCA-B', 'mid'),
  ('2547241', 'R Karan', '4MCA-B', 'back'),
  ('2547242', 'Rahul Gupta', '4MCA-B', 'front'),
  ('2547243', 'Rishi Raj', '4MCA-B', 'mid'),
  ('2547244', 'Roy Mathew', '4MCA-B', 'back'),
  ('2547245', 'Sachin D', '4MCA-B', 'front'),
  ('2547246', 'Saurabh Burnwal', '4MCA-B', 'mid'),
  ('2547247', 'Sharon Mathew', '4MCA-B', 'back'),
  ('2547249', 'Slaven Derick Pais', '4MCA-B', 'front'),
  ('2547250', 'Sneha Varghese', '4MCA-B', 'mid'),
  ('2547252', 'Sudeepa Santhanam', '4MCA-B', 'back'),
  ('2547254', 'Varun Singh', '4MCA-B', 'front'),
  ('2547255', 'Vishwas Vashishtha', '4MCA-B', 'mid'),
  ('2547256', 'Xavier Amith J', '4MCA-B', 'back'),
  ('2547257', 'Yash Barjatya', '4MCA-B', 'front'),
  ('2547259', 'Ananya M', '4MCA-B', 'mid'),
  ('2547260', 'Mistry Jamis', '4MCA-B', 'back'),
  ('2547261', 'Maniarasan J', '4MCA-B', 'front'),
  ('2547262', 'Anushka Singh', '4MCA-B', 'mid')
on conflict (reg_no) do update set
  full_name = excluded.full_name,
  class_section = excluded.class_section,
  seat_zone = excluded.seat_zone;

-- 2) Consent records (v1, signed) ----------------------------------------
-- signature_hash is a sha256 placeholder; the signed form scans are kept
-- offline (DPDP: only the hash lives in the DB).
insert into consent_records (student_id, consent_version, signature_hash)
select s.id, 'v1', encode(digest(s.reg_no || ':v1', 'sha256'), 'hex')
from students s
where s.class_section = '4MCA-B'
  and not exists (select 1 from consent_records c where c.student_id = s.id);

-- 3) Browser-capture device (the laptop webcam client) -------------------
insert into devices (device_key, label, room) values
  ('browser-capture', 'Laptop webcam capture client', '4MCA-B classroom')
on conflict (device_key) do nothing;

-- 4) An open demo session so the teacher dashboard has a live session ----
insert into class_sessions (device_id, class_section, subject, mode, starts_at)
select d.id, '4MCA-B', 'Live demo session', 'lecture', now()
from devices d
where d.device_key = 'browser-capture'
  and not exists (
    select 1 from class_sessions cs where cs.class_section = '4MCA-B' and cs.ends_at is null
  );

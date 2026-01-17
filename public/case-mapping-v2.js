// case-mapping.js (PURE JS file, no <script> tag)
(function () {
  // Paste your full 1..351 tab-separated list inside these backticks:
  // Format per line: ID<TAB>Experience groups (comma-separated)<TAB>Clinical topics (comma-separated)
  const CASE_TSV = String.raw`
1	New presentation of undifferentiated disease, Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
2	Professional conversation / Professional dilemma, "Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
3	Professional conversation / Professional dilemma, Investigation / Results	Musculoskeletal Health
4	Professional conversation / Professional dilemma	Neurology
5	Professional conversation / Professional dilemma	Gastroenterology
6	Professional conversation / Professional dilemma	"Smoking, Alcohol and Substance Misuse"
7	Investigation / Results	Mental Health
8	New presentation of undifferentiated disease	Gastroenterology
9	Investigation / Results	Infectious Diseases and Travel Health
10	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Respiratory Health
11	Investigation / Results	Cardiovascular Health
12	New presentation of undifferentiated disease, Patient less than 19 years old	"Ear, Nose and Throat, Speech and Hearing"
13	New presentation of undifferentiated disease	Neurology
14	New presentation of undifferentiated disease, Patient less than 19 years old	Dermatology, Metabolic Problems and Endocrinology
15	New presentation of undifferentiated disease	Dermatology
16	New presentation of undifferentiated disease	Dermatology
17	New presentation of undifferentiated disease, Patient less than 19 years old	Dermatology, Allergy and Clinical Immunology
18	New presentation of undifferentiated disease	Musculoskeletal Health
19	New presentation of undifferentiated disease	Musculoskeletal Health
20	New presentation of undifferentiated disease	Musculoskeletal Health
21	New presentation of undifferentiated disease	Musculoskeletal Health
22	New presentation of undifferentiated disease	Musculoskeletal Health
23	New presentation of undifferentiated disease	Musculoskeletal Health
24	New presentation of undifferentiated disease	Musculoskeletal Health
25	New presentation of undifferentiated disease	Musculoskeletal Health
26	New presentation of undifferentiated disease	Musculoskeletal Health
27	New presentation of undifferentiated disease, Investigation / Results	Musculoskeletal Health
28	New presentation of undifferentiated disease	Neurology
29	New presentation of undifferentiated disease	Neurology, Eyes and Vision
30	New presentation of undifferentiated disease	Neurology
31	New presentation of undifferentiated disease	Neurology
32	New presentation of undifferentiated disease, "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
33	New presentation of undifferentiated disease	Respiratory Health, "Ear, Nose and Throat, Speech and Hearing"
34	New presentation of undifferentiated disease	Respiratory Health
35	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology
36	New presentation of undifferentiated disease	Dermatology
37	New presentation of undifferentiated disease	Cardiovascular Health
38	New presentation of undifferentiated disease	Cardiovascular Health
39	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health
40	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Patient less than 19 years old	Dermatology
41	Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
42	Urgent and Unscheduled care	Gastroenterology, Urgent and Unscheduled Care
43	Urgent and Unscheduled care	Respiratory Health
44	Urgent and Unscheduled care, New presentation of undifferentiated disease	Cardiovascular Health, Urgent and Unscheduled Care
45	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
46	"Mental health, including addiction, smoking, alcohol, substance misuse", New presentation of undifferentiated disease	Mental Health, Respiratory Health
47	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
48	Professional conversation / Professional dilemma, Urgent and Unscheduled care	Neurology, Respiratory Health
49	"Older adults, including frailty and people at the end of life", "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
50	"Older adults, including frailty and people at the end of life", "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
51	"Older adults, including frailty and people at the end of life"	Cardiovascular Health
52	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Renal and Urology
53	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Genomic Medicine, Neurodevelopmental Conditions and Neurodiversity
54	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Respiratory Health
55	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Gastroenterology
56	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine
57	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
58	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
59	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
60	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
61	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
62	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
63	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Dermatology
64	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
65	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
66	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology, Urgent and Unscheduled Care
67	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Maternity and Reproductive Health
68	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Urgent and Unscheduled Care
69	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
70	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Renal and Urology
71	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
72	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
73	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
74	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
75	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
76	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
77	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Sexual Health
78	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Infectious Diseases and Travel Health, Sexual Health
79	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
80	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
81	Patient less than 19 years old	Infectious Diseases and Travel Health, Neurology
82	Patient less than 19 years old	Gastroenterology
83	Patient less than 19 years old, Prescribing	Infectious Diseases and Travel Health
84	Patient less than 19 years old, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity
85	Patient less than 19 years old, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Gastroenterology, Neurodevelopmental Conditions and Neurodiversity
86	Patient less than 19 years old	Renal and Urology
87	Patient less than 19 years old, New presentation of undifferentiated disease	Neurodevelopmental Conditions and Neurodiversity
88	Patient less than 19 years old, New presentation of undifferentiated disease	Neurology
89	Patient less than 19 years old, New presentation of undifferentiated disease	Musculoskeletal Health
90	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Sexual Health
91	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
92	Prescribing, Patient less than 19 years old	Infectious Diseases and Travel Health
93	Patient less than 19 years old, Professional conversation / Professional dilemma	Allergy and Clinical Immunology
94	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing", Gastroenterology
95	"Older adults, including frailty and people at the end of life"	Neurology
96	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Gynaecology and Breast
97	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Infectious Diseases and Travel Health
98	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
99	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
100	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
101	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
102	Urgent and Unscheduled care, Professional conversation / Professional dilemma	Urgent and Unscheduled Care
103	"Older adults, including frailty and people at the end of life"	Urgent and Unscheduled Care, Respiratory Health
104	"Mental health, including addiction, smoking, alcohol, substance misuse", Professional conversation / Professional dilemma	"Smoking, Alcohol and Substance Misuse"
105	"Older adults, including frailty and people at the end of life"	Neurology
106	Professional conversation / Professional dilemma, "Older adults, including frailty and people at the end of life"	Neurology, Mental Health
107	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
108	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
109	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
110	"Older adults, including frailty and people at the end of life", Prescribing	Cardiovascular Health
111	"Older adults, including frailty and people at the end of life", Prescribing	Cardiovascular Health
112	"Ethnicity, culture, diversity, inclusivity", Prescribing	Metabolic Problems and Endocrinology
113	"Ethnicity, culture, diversity, inclusivity", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Cardiovascular Health
114	"Ethnicity, culture, diversity, inclusivity"	Musculoskeletal Health
115	Prescribing, Professional conversation / Professional dilemma, Patient less than 19 years old	Infectious Diseases and Travel Health
116	Professional conversation / Professional dilemma, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
117	"Ethnicity, culture, diversity, inclusivity"	Maternity and Reproductive Health
118	Prescribing, "Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
119	Professional conversation / Professional dilemma	Infectious Diseases and Travel Health
120	"Mental health, including addiction, smoking, alcohol, substance misuse", New presentation of undifferentiated disease	Mental Health, Musculoskeletal Health
121	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
122	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Metabolic Problems and Endocrinology
123	"Older adults, including frailty and people at the end of life", Prescribing	Mental Health, Musculoskeletal Health
124	Professional conversation / Professional dilemma, Urgent and Unscheduled care	Respiratory Health
125	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity
126	Urgent and Unscheduled care, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health, Learning Disability
127	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
128	New presentation of undifferentiated disease	Gastroenterology
129	"Ethnicity, culture, diversity, inclusivity", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Sexual Health
130	"Long-term condition, including cancer, multi-morbidity, and disability"	Allergy and Clinical Immunology
131	New presentation of undifferentiated disease	Eyes and Vision
132	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
133	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Neurology
134	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
135	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
136	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health, Metabolic Problems and Endocrinology
137	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
138	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
139	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology, Dermatology
140	Investigation / Results, Prescribing	Renal and Urology
141	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	"Smoking, Alcohol and Substance Misuse"
142	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Maternity and Reproductive Health
143	Patient less than 19 years old, New presentation of undifferentiated disease	Infectious Diseases and Travel Health
144	"Long-term condition, including cancer, multi-morbidity, and disability", Professional conversation / Professional dilemma	Gynaecology and Breast
145	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Gynaecology and Breast, Infectious Diseases and Travel Health
146	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing, Patient less than 19 years old	Respiratory Health
147	Urgent and Unscheduled care, New presentation of undifferentiated disease	Cardiovascular Health, Urgent and Unscheduled Care
148	New presentation of undifferentiated disease	Musculoskeletal Health
149	"Long-term condition, including cancer, multi-morbidity, and disability", Urgent and Unscheduled care	Musculoskeletal Health, Urgent and Unscheduled Care, Respiratory Health
150	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse", Investigation / Results	Mental Health
151	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Infectious Diseases and Travel Health, Sexual Health
152	Patient less than 19 years old	Urgent and Unscheduled Care, Infectious Diseases and Travel Health
153	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Mental Health
154	Patient less than 19 years old, New presentation of undifferentiated disease	Dermatology
155	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Gynaecology and Breast
156	"Long-term condition, including cancer, multi-morbidity, and disability", New presentation of undifferentiated disease	Gastroenterology
157	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Patient less than 19 years old	Dermatology
158	"Long-term condition, including cancer, multi-morbidity, and disability"	Gastroenterology
159	Urgent and Unscheduled care, Patient less than 19 years old	Metabolic Problems and Endocrinology
160	Urgent and Unscheduled care, Patient less than 19 years old	Allergy and Clinical Immunology
161	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
162	Patient less than 19 years old	Dermatology
163	Patient less than 19 years old	Renal and Urology
164	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
165	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Respiratory Health
166	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Gynaecology and Breast, Sexual Health
167	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
168	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Sexual Health
169	Urgent and Unscheduled care	Cardiovascular Health, Urgent and Unscheduled Care
170	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Mental Health
171	Investigation / Results, "Older adults, including frailty and people at the end of life"	Haematology
172	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology, Sexual Health
173	Prescribing	"Ear, Nose and Throat, Speech and Hearing"
174	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
175	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology
176	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
177	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
178	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Cardiovascular Health
179	Professional conversation / Professional dilemma	Mental Health
180	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
181	Urgent and Unscheduled care	Neurology
182	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Genomic Medicine
183	Professional conversation / Professional dilemma	Mental Health
184	Prescribing, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
185	Investigation / Results, New presentation of undifferentiated disease	Musculoskeletal Health
186	Prescribing	Gastroenterology
187	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Respiratory Health, Allergy and Clinical Immunology
188	New presentation of undifferentiated disease	Musculoskeletal Health
189	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
190	Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
191	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Gastroenterology
192	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
193	New presentation of undifferentiated disease, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
194	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology, Sexual Health
195	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
196	Professional conversation / Professional dilemma	Mental Health
197	New presentation of undifferentiated disease, Investigation / Results	Infectious Diseases and Travel Health
198	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology
199	Urgent and Unscheduled care	Neurology
200	Investigation / Results	Gastroenterology
201	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Mental Health, Sexual Health
202	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
203	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology, Eyes and Vision
204	New presentation of undifferentiated disease	Dermatology
205	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
206	New presentation of undifferentiated disease	Gastroenterology
207	Investigation / Results, New presentation of undifferentiated disease	Gastroenterology
208	Professional conversation / Professional dilemma	Infectious Diseases and Travel Health
209	Investigation / Results, Patient less than 19 years old	Cardiovascular Health
210	Investigation / Results, Patient less than 19 years old	Renal and Urology
211	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
212	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
213	Patient less than 19 years old, Urgent and Unscheduled care	Dermatology
214	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Professional conversation / Professional dilemma	Mental Health
215	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
216	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
217	New presentation of undifferentiated disease	Musculoskeletal Health
218	New presentation of undifferentiated disease	Musculoskeletal Health
219	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	"Smoking, Alcohol and Substance Misuse"
220	"Ethnicity, culture, diversity, inclusivity", "Older adults, including frailty and people at the end of life"	Gastroenterology
221	New presentation of undifferentiated disease, Investigation / Results	Metabolic Problems and Endocrinology
222	Patient less than 19 years old	Gastroenterology
223	Prescribing, Investigation / Results	Haematology
224	Patient less than 19 years old	Gastroenterology
225	New presentation of undifferentiated disease	Gastroenterology
226	Professional conversation / Professional dilemma	Neurology
227	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
228	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
229	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
230	Urgent and Unscheduled care, Investigation / Results	Metabolic Problems and Endocrinology
231	Investigation / Results, New presentation of undifferentiated disease	Haematology
232	New presentation of undifferentiated disease	Eyes and Vision
233	New presentation of undifferentiated disease	Eyes and Vision
234	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
235	"Mental health, including addiction, smoking, alcohol, substance misuse", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Gastroenterology
236	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity, Learning Disability
237	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
238	Prescribing	Gastroenterology
239	Urgent and Unscheduled care	Infectious Diseases and Travel Health
240	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
241	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Gastroenterology
242	New presentation of undifferentiated disease	Dermatology
243	New presentation of undifferentiated disease	Musculoskeletal Health
244	"Older adults, including frailty and people at the end of life"	Dermatology
245	Patient less than 19 years old	Gastroenterology
246	Urgent and Unscheduled care, Patient less than 19 years old	Gastroenterology
247	"Long-term condition, including cancer, multi-morbidity, and disability"	Eyes and Vision
248	New presentation of undifferentiated disease	Neurology
249	Prescribing, New presentation of undifferentiated disease	Renal and Urology
250	New presentation of undifferentiated disease	Gastroenterology
251	New presentation of undifferentiated disease	Dermatology
252	New presentation of undifferentiated disease, "Older adults, including frailty and people at the end of life"	Neurology
253	"Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
254	New presentation of undifferentiated disease	Haematology
255	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Cardiovascular Health
256	Investigation / Results, "Older adults, including frailty and people at the end of life"	Haematology
257	Professional conversation / Professional dilemma, "Older adults, including frailty and people at the end of life"	Gastroenterology
258	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health
259	New presentation of undifferentiated disease	Dermatology
260	New presentation of undifferentiated disease	Musculoskeletal Health
261	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health
262	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Dermatology
263	Professional conversation / Professional dilemma	Dermatology
264	"Long-term condition, including cancer, multi-morbidity, and disability"	Renal and Urology
265	Prescribing	Gynaecology and Breast
266	Patient less than 19 years old, New presentation of undifferentiated disease	Gastroenterology
267	New presentation of undifferentiated disease	Dermatology
268	Urgent and Unscheduled care, New presentation of undifferentiated disease	Renal and Urology
269	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Cardiovascular Health
270	New presentation of undifferentiated disease	Dermatology
271	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
272	Urgent and Unscheduled care, "Ethnicity, culture, diversity, inclusivity"	Haematology
273	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Older adults, including frailty and people at the end of life"	Dermatology
274	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology
275	Patient less than 19 years old	"Ear, Nose and Throat, Speech and Hearing"
276	Prescribing	Mental Health, Renal and Urology
277	Prescribing, New presentation of undifferentiated disease	Neurology
278	New presentation of undifferentiated disease	Cardiovascular Health
279	"Long-term condition, including cancer, multi-morbidity, and disability"	Renal and Urology
280	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
281	"Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
282	New presentation of undifferentiated disease, Prescribing	Infectious Diseases and Travel Health
283	Investigation / Results	Genomic Medicine, Gynaecology and Breast
284	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
285	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
286	New presentation of undifferentiated disease	Dermatology
287	Patient less than 19 years old	Metabolic Problems and Endocrinology
288	Patient less than 19 years old	Metabolic Problems and Endocrinology
289	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
290	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
291	New presentation of undifferentiated disease	Dermatology
292	New presentation of undifferentiated disease	Renal and Urology
293	"Older adults, including frailty and people at the end of life"	Renal and Urology, Mental Health
294	"Long-term condition, including cancer, multi-morbidity, and disability"	Gastroenterology, Metabolic Problems and Endocrinology
295	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
296	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
297	Patient less than 19 years old, "Ethnicity, culture, diversity, inclusivity"	Metabolic Problems and Endocrinology
298	New presentation of undifferentiated disease	Musculoskeletal Health, Gastroenterology
299	New presentation of undifferentiated disease, "Ethnicity, culture, diversity, inclusivity"	Respiratory Health
300	"Ethnicity, culture, diversity, inclusivity"	Gynaecology and Breast
301	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", "Ethnicity, culture, diversity, inclusivity"	Maternity and Reproductive Health, Infectious Diseases and Travel Health
302	New presentation of undifferentiated disease, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurology
303	New presentation of undifferentiated disease, Prescribing	Gastroenterology
304	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Infectious Diseases and Travel Health
305	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Infectious Diseases and Travel Health
306	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Infectious Diseases and Travel Health
307	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
308	"Mental health, including addiction, smoking, alcohol, substance misuse", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Mental Health
309	Investigation / Results	Metabolic Problems and Endocrinology
310	New presentation of undifferentiated disease	Musculoskeletal Health
311	New presentation of undifferentiated disease	Respiratory Health
312	Investigation / Results, "Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
313	Patient less than 19 years old, New presentation of undifferentiated disease	Neurodevelopmental Conditions and Neurodiversity
314	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Genomic Medicine
315	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
316	Investigation / Results, "Ethnicity, culture, diversity, inclusivity"	Haematology
317	New presentation of undifferentiated disease, Urgent and Unscheduled care	Haematology, Dermatology
318	Prescribing	Mental Health
319	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
320	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Respiratory Health, Cardiovascular Health
321	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
322	Patient less than 19 years old	Metabolic Problems and Endocrinology
323	Patient less than 19 years old, New presentation of undifferentiated disease	Gastroenterology
324	New presentation of undifferentiated disease, Prescribing	Infectious Diseases and Travel Health, Dermatology
325	Investigation / Results, New presentation of undifferentiated disease	Gastroenterology, Haematology
326	Prescribing	Haematology
327	New presentation of undifferentiated disease, "Older adults, including frailty and people at the end of life"	Neurology
328	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Sexual Health
329	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old, "Ethnicity, culture, diversity, inclusivity"	Sexual Health, Infectious Diseases and Travel Health
330	Investigation / Results	Haematology
331	New presentation of undifferentiated disease	Infectious Diseases and Travel Health, Sexual Health
332	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
333	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Dermatology, Maternity and Reproductive Health
334	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
335	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Maternity and Reproductive Health
336	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Maternity and Reproductive Health
337	Investigation / Results	Metabolic Problems and Endocrinology
338	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
339	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Musculoskeletal Health
340	Investigation / Results, New presentation of undifferentiated disease	Infectious Diseases and Travel Health, Renal and Urology
341	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
342	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Maternity and Reproductive Health, Gynaecology and Breast
343	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Maternity and Reproductive Health
344	New presentation of undifferentiated disease, Patient less than 19 years old	Musculoskeletal Health
345	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
346	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
347	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
348	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Gynaecology and Breast, Maternity and Reproductive Health
349	"Long-term condition, including cancer, multi-morbidity, and disability", New presentation of undifferentiated disease	Musculoskeletal Health, Dermatology
350	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
351	Investigation / Results, New presentation of undifferentiated disease	Respiratory Health, Haematology
`.trim();

  // ---- Canonical lists ----
  const TOPICS = [
    "Allergy and clinical immunology",
    "Cardiovascular health",
    "Dermatology",
    "Ear, nose and throat, speech and hearing",
    "Eyes and vision",
    "Gastroenterology",
    "Genomic medicine",
    "Gynaecology and breast health",
    "Haematology",
    "Infectious diseases and travel health",
    "Learning disability",
    "Maternity and reproductive health",
    "Mental health",
    "Metabolic problems and endocrinology",
    "Musculoskeletal health",
    "Neurodevelopmental conditions and neurodiversity",
    "Neurology",
    "Renal and urology",
    "Respiratory health",
    "Sexual health",
    "Smoking, alcohol and substance misuse",
    "Urgent and unscheduled care"
  ];

  const EXPERIENCE_GROUPS = [
    "Patient less than 19 years old",
    "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast",
    "Long-term condition, including cancer, multi-morbidity, and disability",
    "Older adults, including frailty and people at the end of life",
    "Mental health, including addiction, smoking, alcohol, substance misuse",
    "Urgent and unscheduled care",
    "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties",
    "Ethnicity, culture, diversity, inclusivity",
    "New presentation of undifferentiated disease",
    "Prescribing",
    "Investigation / Results",
    "Professional conversation / Professional dilemma"
  ];

  // ---- Normalisation helpers ----
  function normKey(s) {
    return String(s ?? "")
      .trim()
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function buildLookup(canonList) {
    const m = new Map();
    for (const label of canonList) {
      m.set(normKey(label), label);
      m.set(normKey(label).replace(/,/g, ""), label);
    }
    return m;
  }

  const TOPIC_LOOKUP = buildLookup(TOPICS);
  const GROUP_LOOKUP = buildLookup(EXPERIENCE_GROUPS);

  // Split comma-separated values but respect "quoted, commas"
  function splitCsvish(raw) {
    const s = String(raw ?? "").trim();
    if (!s) return [];

    const out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < s.length; i++) {
      const ch = s[i];

      if (ch === '"') {
        inQ = !inQ;
        continue;
      }

      if (!inQ && ch === ",") {
        const t = cur.trim();
        if (t) out.push(t);
        cur = "";
        continue;
      }

      cur += ch;
    }

    const last = cur.trim();
    if (last) out.push(last);

    return out;
  }

  // Extra topic aliases you actually have in your TSV
  const TOPIC_ALIASES = new Map([
    [normKey("Cardiovascular Health"), "Cardiovascular health"],
    [normKey("Musculoskeletal Health"), "Musculoskeletal health"],
    [normKey("Mental Health"), "Mental health"],
    [normKey("Respiratory Health"), "Respiratory health"],
    [normKey("Genomic Medicine"), "Genomic medicine"],
    [normKey("Gynaecology and Breast"), "Gynaecology and breast health"],
    [normKey("Allergy and Clinical Immunology"), "Allergy and clinical immunology"],
    [normKey("Infectious Diseases and Travel Health"), "Infectious diseases and travel health"],
    [normKey("Metabolic Problems and Endocrinology"), "Metabolic problems and endocrinology"],
    [normKey("Eyes and Vision"), "Eyes and vision"],
    [normKey("Renal and Urology"), "Renal and urology"],
    [normKey("Urgent and Unscheduled Care"), "Urgent and unscheduled care"],
    [normKey("Ear, Nose and Throat, Speech and Hearing"), "Ear, nose and throat, speech and hearing"],
    [normKey("Smoking, Alcohol and Substance Misuse"), "Smoking, alcohol and substance misuse"]
  ]);

  function canonTopicOne(token) {
    const t = String(token ?? "").trim();
    if (!t) return "";
    const k = normKey(t);

    if (TOPIC_ALIASES.has(k)) return TOPIC_ALIASES.get(k);

    return (
      TOPIC_LOOKUP.get(k) ||
      TOPIC_LOOKUP.get(k.replace(/,/g, "")) ||
      t
    );
  }

  function canonGroupOne(token) {
    const t = String(token ?? "").trim();
    if (!t) return "";
    const k = normKey(t);

    // Variant that appears in your TSV
    if (k === normKey("Urgent and Unscheduled care")) return "Urgent and unscheduled care";

    return (
      GROUP_LOOKUP.get(k) ||
      GROUP_LOOKUP.get(k.replace(/,/g, "")) ||
      t
    );
  }

  function canonTopics(rawField) {
    return Array.from(
      new Set(splitCsvish(rawField).map(canonTopicOne).filter(Boolean))
    );
  }

  function canonGroups(rawField) {
    return Array.from(
      new Set(splitCsvish(rawField).map(canonGroupOne).filter(Boolean))
    );
  }

  function parseCaseTsv(tsv) {
    const lines = String(tsv || "")
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(Boolean);

    const out = [];
    for (const line of lines) {
      const cols = line.split("\t");
      if (cols.length < 3) continue;

      const id = Number(String(cols[0]).trim());
      if (!Number.isFinite(id)) continue;

      const groupsRaw = cols[1];
      const topicsRaw = cols[2];

      out.push({
        id,
        groups: canonGroups(groupsRaw),
        topics: canonTopics(topicsRaw)
      });
    }
    return out;
  }

  window.SCA_CASE_MAP = parseCaseTsv(CASE_TSV);

  console.log("[case-mapping] SCA_CASE_MAP length:", window.SCA_CASE_MAP.length);
  console.log("[case-mapping] sample:", window.SCA_CASE_MAP.slice(0, 3));
})();

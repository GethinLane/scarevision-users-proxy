// case-mapping.js
document.addEventListener("DOMContentLoaded", () => {

  // Paste your full tab-separated list inside these backticks.
  // Format per line:
  // Name<TAB>ID<TAB>Experience groups (comma-separated)<TAB>Clinical topics (comma-separated)
  const CASE_TSV = String.raw`
  Lymphadenopathy: Suspected Cancer	1	New presentation of undifferentiated disease, Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
Angry Patient: Medication Stopped	2	Professional conversation / Professional dilemma, "Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
Sciatica: Complaint	3	Professional conversation / Professional dilemma, Investigation / Results	Musculoskeletal Health
Third Party Information Request	4	Professional conversation / Professional dilemma	Neurology
Fit Note: 2	5	Professional conversation / Professional dilemma	Gastroenterology
Fit Note: 1	6	Professional conversation / Professional dilemma	"Smoking, Alcohol and Substance Misuse"
Chronic Fatigue Syndrome (CFS)	7	Investigation / Results	Mental Health
Irritable Bowel Syndrome (IBS)	8	New presentation of undifferentiated disease	Gastroenterology
Hepatitis C: Test Result	9	Investigation / Results	Infectious Diseases and Travel Health
Chronic Obstructive Pulmonary Disease (COPD)	10	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Respiratory Health
Atrial Fibrillation: New Diagnosis	11	Investigation / Results	Cardiovascular Health
Tonsillectomy Request	12	New presentation of undifferentiated disease, Patient less than 19 years old	"Ear, Nose and Throat, Speech and Hearing"
Bell's Palsy	13	New presentation of undifferentiated disease	Neurology
Acne Vulgaris & PCOS	14	New presentation of undifferentiated disease, Patient less than 19 years old	Dermatology, Metabolic Problems and Endocrinology
Actinic Keratosis	15	New presentation of undifferentiated disease	Dermatology
Psoriasis	16	New presentation of undifferentiated disease	Dermatology
Eczema: In Children	17	New presentation of undifferentiated disease, Patient less than 19 years old	Dermatology, Allergy and Clinical Immunology
Osteoarthritis Hip	18	New presentation of undifferentiated disease	Musculoskeletal Health
Carpal Tunnel Syndrome	19	New presentation of undifferentiated disease	Musculoskeletal Health
Shoulder Impingement	20	New presentation of undifferentiated disease	Musculoskeletal Health
Sciatica	21	New presentation of undifferentiated disease	Musculoskeletal Health
Tennis Elbow	22	New presentation of undifferentiated disease	Musculoskeletal Health
Achilles Tendinopathy	23	New presentation of undifferentiated disease	Musculoskeletal Health
Plantar Fasciitis	24	New presentation of undifferentiated disease	Musculoskeletal Health
Meniscal Tear	25	New presentation of undifferentiated disease	Musculoskeletal Health
Gout	26	New presentation of undifferentiated disease	Musculoskeletal Health
Rheumatoid Arthritis	27	New presentation of undifferentiated disease, Investigation / Results	Musculoskeletal Health
Migraine: Acute	28	New presentation of undifferentiated disease	Neurology
Multiple Sclerosis	29	New presentation of undifferentiated disease	Neurology, Eyes and Vision
Transient Global Amnesia	30	New presentation of undifferentiated disease	Neurology
First Seizure	31	New presentation of undifferentiated disease	Neurology
Parkinson's Disease	32	New presentation of undifferentiated disease, "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
Sleep Apnoea	33	New presentation of undifferentiated disease	Respiratory Health, "Ear, Nose and Throat, Speech and Hearing"
Asthma: New	34	New presentation of undifferentiated disease	Respiratory Health
Hypercalcaemia: Symptomatic	35	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology
Shingles	36	New presentation of undifferentiated disease	Dermatology
Ischaemic Heart Disease (Angina)	37	New presentation of undifferentiated disease	Cardiovascular Health
Peripheral Arterial Disease	38	New presentation of undifferentiated disease	Cardiovascular Health
Domestic Abuse	39	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health
Safeguarding	40	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Patient less than 19 years old	Dermatology
Laryngeal Cancer: Suspected	41	Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
Colorectal Cancer: Suspected	42	Urgent and Unscheduled care	Gastroenterology, Urgent and Unscheduled Care
Lung Cancer	43	Urgent and Unscheduled care	Respiratory Health
Acute MI: 1	44	Urgent and Unscheduled care, New presentation of undifferentiated disease	Cardiovascular Health, Urgent and Unscheduled Care
Smoking Cessation	45	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
Anxiety: Panic Disorder	46	"Mental health, including addiction, smoking, alcohol, substance misuse", New presentation of undifferentiated disease	Mental Health, Respiratory Health
Depression	47	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Dementia: Paramedic Consultation - Delerium	48	Professional conversation / Professional dilemma, Urgent and Unscheduled care	Neurology, Respiratory Health
Dementia: Likely Diagnosis	49	"Older adults, including frailty and people at the end of life", "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
Dementia: Potential Diagnosis	50	"Older adults, including frailty and people at the end of life", "Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
CPR Discussion	51	"Older adults, including frailty and people at the end of life"	Cardiovascular Health
Polycystic Kidney Disease	52	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Renal and Urology
Down’s Syndrome Screening	53	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Genomic Medicine, Neurodevelopmental Conditions and Neurodiversity
Cystic Fibrosis	54	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Respiratory Health
Familial Adenomatous Polyposis	55	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Gastroenterology
Haemochromatosis	56	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine
Type II Diabetes: New	57	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
Type II Diabetes: Review	58	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
Pre-Diabetes: II	59	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
Pre-Diabetes: I	60	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
Post Myocardial Infarction	61	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
CVD Risk: Primary Prevention	62	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
Androgenic Alopecia	63	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Dermatology
Vasectomy	64	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
LUTS: Suspected BPH	65	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
Gynaecomastia	66	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology, Urgent and Unscheduled Care
Termination of Pregnancy	67	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Maternity and Reproductive Health
Pre Eclampsia	68	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Urgent and Unscheduled Care
Menorrhagia	69	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Urinary Incontinence	70	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Renal and Urology
Post Menopausal Bleeding	71	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Intermenstrual Bleeding	72	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Premature Ejaculation	73	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Infertility	74	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Contraception: Later Life	75	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Contraception: Emergency (1)	76	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Contraception: Teenager	77	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Sexual Health
Genital Herpes	78	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Infectious Diseases and Travel Health, Sexual Health
Anorexia Nervosa	79	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Needle Stick Injury	80	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
Febrile Seizure	81	Patient less than 19 years old	Infectious Diseases and Travel Health, Neurology
Infantile Colic	82	Patient less than 19 years old	Gastroenterology
Meningitis Contact	83	Patient less than 19 years old, Prescribing	Infectious Diseases and Travel Health
Autism	84	Patient less than 19 years old, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity
Constipation: Cerebral Palsy	85	Patient less than 19 years old, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Gastroenterology, Neurodevelopmental Conditions and Neurodiversity
Nocturnal Enuresis	86	Patient less than 19 years old	Renal and Urology
ADHD: Child	87	Patient less than 19 years old, New presentation of undifferentiated disease	Neurodevelopmental Conditions and Neurodiversity
Paediatric Migraine	88	Patient less than 19 years old, New presentation of undifferentiated disease	Neurology
Mechanical Back Pain: Teenager	89	Patient less than 19 years old, New presentation of undifferentiated disease	Musculoskeletal Health
Gender Dysphoria: Bridging Medication	90	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Sexual Health
Gender Dysphoria: Private 'Shared Care' Request	91	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Prophylactic Antibiotic Request	92	Prescribing, Patient less than 19 years old	Infectious Diseases and Travel Health
Vaccine Consent Teenager	93	Patient less than 19 years old, Professional conversation / Professional dilemma	Allergy and Clinical Immunology
Globus	94	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing", Gastroenterology
Dementia: Managing Aggression	95	"Older adults, including frailty and people at the end of life"	Neurology
Breast Cancer: Genetics	96	"Long-term condition, including cancer, multi-morbidity, and disability"	Genomic Medicine, Gynaecology and Breast
Ongoing COVID19	97	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Infectious Diseases and Travel Health
Menopause: Diagnosis & Management	98	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
HRT: Testosterone	99	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
HRT: Bleeding	100	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Panic Attack	101	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Care Home Nurse: Acute Limb Ischaemia	102	Urgent and Unscheduled care, Professional conversation / Professional dilemma	Urgent and Unscheduled Care
Palliative Care: Nurse Request	103	"Older adults, including frailty and people at the end of life"	Urgent and Unscheduled Care, Respiratory Health
Drug Use At School	104	"Mental health, including addiction, smoking, alcohol, substance misuse", Professional conversation / Professional dilemma	"Smoking, Alcohol and Substance Misuse"
Dementia: Lewy Body	105	"Older adults, including frailty and people at the end of life"	Neurology
Assisted Dying Request	106	Professional conversation / Professional dilemma, "Older adults, including frailty and people at the end of life"	Neurology, Mental Health
Domestic Abuse from a Minor	107	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Post Traumatic Stress Disorder	108	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Stress	109	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Anticholinergic Burden	110	"Older adults, including frailty and people at the end of life", Prescribing	Cardiovascular Health
Postural Hypotension and Dehydration	111	"Older adults, including frailty and people at the end of life", Prescribing	Cardiovascular Health
Diabetes, Insulin and Ramadan	112	"Ethnicity, culture, diversity, inclusivity", Prescribing	Metabolic Problems and Endocrinology
Hypertension in Pregnancy: Traveller Community	113	"Ethnicity, culture, diversity, inclusivity", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Cardiovascular Health
Disability Discrimination	114	"Ethnicity, culture, diversity, inclusivity"	Musculoskeletal Health
Angry Parent, Health Anxiety	115	Prescribing, Professional conversation / Professional dilemma, Patient less than 19 years old	Infectious Diseases and Travel Health
Staff as patient, bullying at work	116	Professional conversation / Professional dilemma, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Minimal Intervention Antenatal Care Request due to Religious Beliefs	117	"Ethnicity, culture, diversity, inclusivity"	Maternity and Reproductive Health
Chronic Pain Management	118	Prescribing, "Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
Debriefing ANP: Managing Mistakes	119	Professional conversation / Professional dilemma	Infectious Diseases and Travel Health
Health Anxiety	120	"Mental health, including addiction, smoking, alcohol, substance misuse", New presentation of undifferentiated disease	Mental Health, Musculoskeletal Health
Lipid Management: Secondary Prevention	121	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
Diabulimia	122	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Metabolic Problems and Endocrinology
Carer Strain: Affecting Carer Health	123	"Older adults, including frailty and people at the end of life", Prescribing	Mental Health, Musculoskeletal Health
Disagreeing with Paramedic: PE	124	Professional conversation / Professional dilemma, Urgent and Unscheduled care	Respiratory Health
Autistic Stimming	125	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity
Iatrogenic Fracture	126	Urgent and Unscheduled care, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health, Learning Disability
Serotonin Syndrome	127	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
Polyphagia	128	New presentation of undifferentiated disease	Gastroenterology
Female Genital Mutilation	129	"Ethnicity, culture, diversity, inclusivity", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Sexual Health
Allergic Rhinitis	130	"Long-term condition, including cancer, multi-morbidity, and disability"	Allergy and Clinical Immunology
Dry Eyes	131	New presentation of undifferentiated disease	Eyes and Vision
Ehlers-Danlos Syndrome	132	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
Chronic Migraine	133	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Neurology
Insomnia	134	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
Depression: Lifestyle Intervention	135	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
Fragility Fracture	136	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health, Metabolic Problems and Endocrinology
Obsessive Compulsive Disorder	137	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
Alcohol Misuse	138	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
Hyperhidrosis	139	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology, Dermatology
Acute Kidney Injury	140	Investigation / Results, Prescribing	Renal and Urology
Safeguarding: Alcohol Excess	141	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	"Smoking, Alcohol and Substance Misuse"
Hyperemesis Gravidarum	142	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Maternity and Reproductive Health
Glandular Fever	143	Patient less than 19 years old, New presentation of undifferentiated disease	Infectious Diseases and Travel Health
Possible Cancer Referral Dilemma	144	"Long-term condition, including cancer, multi-morbidity, and disability", Professional conversation / Professional dilemma	Gynaecology and Breast
Mild Dyskaryosis, HPV Positive	145	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Gynaecology and Breast, Infectious Diseases and Travel Health
Asthma: 5-11 yr old	146	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing, Patient less than 19 years old	Respiratory Health
Acute MI: 2	147	Urgent and Unscheduled care, New presentation of undifferentiated disease	Cardiovascular Health, Urgent and Unscheduled Care
Wrist Tendinitis	148	New presentation of undifferentiated disease	Musculoskeletal Health
Pathological fracture	149	"Long-term condition, including cancer, multi-morbidity, and disability", Urgent and Unscheduled care	Musculoskeletal Health, Urgent and Unscheduled Care, Respiratory Health
Behavioural Difficulties	150	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse", Investigation / Results	Mental Health
STI: 14 year old	151	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Infectious Diseases and Travel Health, Sexual Health
Recurrent Viral Infection	152	Patient less than 19 years old	Urgent and Unscheduled Care, Infectious Diseases and Travel Health
Premenstrual Dysphoric Disorder	153	Patient less than 19 years old, "Mental health, including addiction, smoking, alcohol, substance misuse", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Mental Health
Skin Picking	154	Patient less than 19 years old, New presentation of undifferentiated disease	Dermatology
Menopause: HRT & Contraception	155	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Gynaecology and Breast
Ulcerative Colitis: New Diagnosis	156	"Long-term condition, including cancer, multi-morbidity, and disability", New presentation of undifferentiated disease	Gastroenterology
Cold Sore (HSV-1)	157	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Patient less than 19 years old	Dermatology
Crohn's Disease: Flare up	158	"Long-term condition, including cancer, multi-morbidity, and disability"	Gastroenterology
Type I Diabetes: DKA	159	Urgent and Unscheduled care, Patient less than 19 years old	Metabolic Problems and Endocrinology
Angioedema Follow-Up	160	Urgent and Unscheduled care, Patient less than 19 years old	Allergy and Clinical Immunology
Hepatitis A	161	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
Acne: Self-care	162	Patient less than 19 years old	Dermatology
Nocturnal Enuresis: Desmopressin	163	Patient less than 19 years old	Renal and Urology
Gambling Disorder	164	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
COPD: Exacerbation in a Homeless Patient	165	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Respiratory Health
Contraception: Emergency & Quick Start	166	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Gynaecology and Breast, Sexual Health
HFpEF	167	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
Latex Allergy	168	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Sexual Health
Unstable Angina	169	Urgent and Unscheduled care	Cardiovascular Health, Urgent and Unscheduled Care
Domestic Abuse: Forced Marriage	170	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Mental Health
Low Ferritin, Poor Diet	171	Investigation / Results, "Older adults, including frailty and people at the end of life"	Haematology
Recurrent UTI: Due to Sex	172	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology, Sexual Health
Dental Abscess	173	Prescribing	"Ear, Nose and Throat, Speech and Hearing"
Type II Diabetes: Diet	174	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Metabolic Problems and Endocrinology
Recurrent UTI: Age Related	175	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology
Menopause: HRT (Older)	176	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
Suspected Ovarian Cancer	177	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Gynaecomastia: Spironolactone	178	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Cardiovascular Health
Fitness to Practise: Colleague	179	Professional conversation / Professional dilemma	Mental Health
Eustachian Tube Dysfunction	180	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
Cauda Equina Syndrome	181	Urgent and Unscheduled care	Neurology
Huntington's Disease	182	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Genomic Medicine
Seeking CT Scan as Health Check	183	Professional conversation / Professional dilemma	Mental Health
Diazepam Addiction	184	Prescribing, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Chronic Gout: Urate Lowering Therapy	185	Investigation / Results, New presentation of undifferentiated disease	Musculoskeletal Health
Weight Loss Injections	186	Prescribing	Gastroenterology
Asthma: Concerns over Allergy	187	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Respiratory Health, Allergy and Clinical Immunology
De Quervain's Tenosynovitis	188	New presentation of undifferentiated disease	Musculoskeletal Health
Hoarding	189	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Vestibular Neuronitis: ACP Consultation	190	Urgent and Unscheduled care	"Ear, Nose and Throat, Speech and Hearing"
Diverticulitis	191	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Gastroenterology
Testosterone Replacement Therapy	192	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
Low Testosterone	193	New presentation of undifferentiated disease, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology
Erectile Dysfunction	194	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Metabolic Problems and Endocrinology, Sexual Health
AF: Anticoagulation	195	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
Seeking Preferential Treatment	196	Professional conversation / Professional dilemma	Mental Health
Dengue Fever	197	New presentation of undifferentiated disease, Investigation / Results	Infectious Diseases and Travel Health
Hypothyroid	198	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology
TIA	199	Urgent and Unscheduled care	Neurology
Fatty Liver	200	Investigation / Results	Gastroenterology
Gender Dysphoria: Adolescent	201	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old	Mental Health, Sexual Health
Cannabis Abuse	202	"Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
Graves' Disease	203	New presentation of undifferentiated disease	Metabolic Problems and Endocrinology, Eyes and Vision
Lichenoid Drug Reaction	204	New presentation of undifferentiated disease	Dermatology
Post Partum Psychosis	205	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Reflux: Iatrogenic	206	New presentation of undifferentiated disease	Gastroenterology
Paget's Disease	207	Investigation / Results, New presentation of undifferentiated disease	Gastroenterology
HIV: Confidentiality	208	Professional conversation / Professional dilemma	Infectious Diseases and Travel Health
Sudden Cardiac Death	209	Investigation / Results, Patient less than 19 years old	Cardiovascular Health
Microscopic Haematuria: Teen	210	Investigation / Results, Patient less than 19 years old	Renal and Urology
Tinnitus	211	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
Osteoporosis: New	212	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
Viral Exanthem	213	Patient less than 19 years old, Urgent and Unscheduled care	Dermatology
Carer Breakdown: Safeguarding	214	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", Professional conversation / Professional dilemma	Mental Health
Hypertension: New	215	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
Hypertension: Old	216	"Long-term condition, including cancer, multi-morbidity, and disability"	Cardiovascular Health
Polymyalgia Rheumatica	217	New presentation of undifferentiated disease	Musculoskeletal Health
Restless Legs: Pregnancy	218	New presentation of undifferentiated disease	Musculoskeletal Health
Heroin Abuse: Pregnancy	219	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	"Smoking, Alcohol and Substance Misuse"
Palliative Care: Islam	220	"Ethnicity, culture, diversity, inclusivity", "Older adults, including frailty and people at the end of life"	Gastroenterology
Postpartum Thyroiditis	221	New presentation of undifferentiated disease, Investigation / Results	Metabolic Problems and Endocrinology
Constipation: Toddler	222	Patient less than 19 years old	Gastroenterology
Suboptimal INR	223	Prescribing, Investigation / Results	Haematology
Infant Reflux	224	Patient less than 19 years old	Gastroenterology
Haemorrhoids	225	New presentation of undifferentiated disease	Gastroenterology
Paramedic Consultation: Stroke	226	Professional conversation / Professional dilemma	Neurology
Parvovirus B19: Child	227	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
Parvovirus B19: Pregnancy	228	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Infectious Diseases and Travel Health
Osteoporosis: Review	229	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
Addison's Disease: Crisis	230	Urgent and Unscheduled care, Investigation / Results	Metabolic Problems and Endocrinology
Thrombocytopenia	231	Investigation / Results, New presentation of undifferentiated disease	Haematology
Anterior Uveitis	232	New presentation of undifferentiated disease	Eyes and Vision
Wet AMD	233	New presentation of undifferentiated disease	Eyes and Vision
Heart Failure: Deterioration	234	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Cardiovascular Health
Alcohol Misuse: Withdrawal	235	"Mental health, including addiction, smoking, alcohol, substance misuse", "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Gastroenterology
Down's Syndrome: Behavioural Change	236	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurodevelopmental Conditions and Neurodiversity, Learning Disability
Bereavement	237	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Reflux: Iatrogenic 2	238	Prescribing	Gastroenterology
TB: Pott's Disease	239	Urgent and Unscheduled care	Infectious Diseases and Travel Health
TB	240	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
Coeliac Disease	241	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Gastroenterology
Acute Urticaria	242	New presentation of undifferentiated disease	Dermatology
Raynaud's	243	New presentation of undifferentiated disease	Musculoskeletal Health
Scabies	244	"Older adults, including frailty and people at the end of life"	Dermatology
Cow's Milk Protein Allergy	245	Patient less than 19 years old	Gastroenterology
Appendicitis	246	Urgent and Unscheduled care, Patient less than 19 years old	Gastroenterology
Glaucoma	247	"Long-term condition, including cancer, multi-morbidity, and disability"	Eyes and Vision
Trigeminal Neuralgia	248	New presentation of undifferentiated disease	Neurology
Recurrent UTI: Male	249	Prescribing, New presentation of undifferentiated disease	Renal and Urology
Halitosis	250	New presentation of undifferentiated disease	Gastroenterology
PUPPP	251	New presentation of undifferentiated disease	Dermatology
Migraine: Social Stress	252	New presentation of undifferentiated disease, "Older adults, including frailty and people at the end of life"	Neurology
Dementia: Driving Concern	253	"Long-term condition, including cancer, multi-morbidity, and disability"	Neurology
Myeloma	254	New presentation of undifferentiated disease	Haematology
Hypertension: Homeless	255	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Cardiovascular Health
CLL	256	Investigation / Results, "Older adults, including frailty and people at the end of life"	Haematology
Palliative Care: Nausea	257	Professional conversation / Professional dilemma, "Older adults, including frailty and people at the end of life"	Gastroenterology
Safeguarding: Back Pain	258	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Musculoskeletal Health
Alopecia Areata	259	New presentation of undifferentiated disease	Dermatology
Chest Pain: Costochondritis	260	New presentation of undifferentiated disease	Musculoskeletal Health
Chickenpox: Pregnancy	261	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health
Epidermoid Cyst	262	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Dermatology
Incorrect Prescribing: Duty of Candour	263	Professional conversation / Professional dilemma	Dermatology
MS: Incontinence	264	"Long-term condition, including cancer, multi-morbidity, and disability"	Renal and Urology
Heavy Periods: Epilepsy	265	Prescribing	Gynaecology and Breast
Picky Eater	266	Patient less than 19 years old, New presentation of undifferentiated disease	Gastroenterology
Tinea Pedis	267	New presentation of undifferentiated disease	Dermatology
Post Infections Glomerulonephritis	268	Urgent and Unscheduled care, New presentation of undifferentiated disease	Renal and Urology
Heart Failure	269	"Long-term condition, including cancer, multi-morbidity, and disability", Investigation / Results	Cardiovascular Health
BCC	270	New presentation of undifferentiated disease	Dermatology
Primary Hyperaldosteronism	271	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
Sickle Cell Crisis	272	Urgent and Unscheduled care, "Ethnicity, culture, diversity, inclusivity"	Haematology
Pressure Sore: Safeguarding	273	"Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties", "Older adults, including frailty and people at the end of life"	Dermatology
PSA Request	274	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Renal and Urology
Otitis Media with Effusion	275	Patient less than 19 years old	"Ear, Nose and Throat, Speech and Hearing"
Fluoroquinolones: Suicide Risk	276	Prescribing	Mental Health, Renal and Urology
Medication Overuse Headache	277	Prescribing, New presentation of undifferentiated disease	Neurology
Aortic Stenosis: New	278	New presentation of undifferentiated disease	Cardiovascular Health
CKD: New	279	"Long-term condition, including cancer, multi-morbidity, and disability"	Renal and Urology
TMJ Disorder	280	New presentation of undifferentiated disease	"Ear, Nose and Throat, Speech and Hearing"
Type II Diabetes: Social	281	"Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
Whooping Cough: Pertussis	282	New presentation of undifferentiated disease, Prescribing	Infectious Diseases and Travel Health
Ovarian Cancer: Genetics	283	Investigation / Results	Genomic Medicine, Gynaecology and Breast
Chronic Prostatitis	284	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
Influenza	285	New presentation of undifferentiated disease	Infectious Diseases and Travel Health
Pityriasis Rosea	286	New presentation of undifferentiated disease	Dermatology
Pubertal Delay: CDGP	287	Patient less than 19 years old	Metabolic Problems and Endocrinology
Precocious Puberty	288	Patient less than 19 years old	Metabolic Problems and Endocrinology
Wellbeing: Burnout	289	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Fibromyalgia	290	"Long-term condition, including cancer, multi-morbidity, and disability"	Musculoskeletal Health
Cellulitis: Spider Bite	291	New presentation of undifferentiated disease	Dermatology
Bladder Cancer: Suspected	292	New presentation of undifferentiated disease	Renal and Urology
DNACPR: Disagreement	293	"Older adults, including frailty and people at the end of life"	Renal and Urology, Mental Health
Pancreatic Cancer: Poor Diabetic Control	294	"Long-term condition, including cancer, multi-morbidity, and disability"	Gastroenterology, Metabolic Problems and Endocrinology
Bipolar: Hypomania	295	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Endometriosis	296	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Rickets: Vitamin D Deficiency	297	Patient less than 19 years old, "Ethnicity, culture, diversity, inclusivity"	Metabolic Problems and Endocrinology
Systemic Sclerosis (Scleroderma)	298	New presentation of undifferentiated disease	Musculoskeletal Health, Gastroenterology
Sarcoidosis	299	New presentation of undifferentiated disease, "Ethnicity, culture, diversity, inclusivity"	Respiratory Health
Smear Refusal	300	"Ethnicity, culture, diversity, inclusivity"	Gynaecology and Breast
Hepatitis B: Pregnancy	301	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", "Ethnicity, culture, diversity, inclusivity"	Maternity and Reproductive Health, Infectious Diseases and Travel Health
Post-concussion Syndrome: Domestic Abuse	302	New presentation of undifferentiated disease, "Health disadvantage and vulnerabilities, including veterans, mental capacity, safeguarding, and communication difficulties"	Neurology
Pancreatitis: Acute	303	New presentation of undifferentiated disease, Prescribing	Gastroenterology
Rubella Contact: Pregnancy	304	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Maternity and Reproductive Health, Infectious Diseases and Travel Health
STI Prophylaxis	305	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Infectious Diseases and Travel Health
Genital Herpes: Recurrent	306	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Infectious Diseases and Travel Health
Hypothyroid: Treatment Failure	307	Investigation / Results, "Long-term condition, including cancer, multi-morbidity, and disability"	Metabolic Problems and Endocrinology
Depression: Antenatal	308	"Mental health, including addiction, smoking, alcohol, substance misuse", "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Mental Health
Hypercalcaemia: Borderline & Asymptomatic	309	Investigation / Results	Metabolic Problems and Endocrinology
Stress Fracture: Low BMI	310	New presentation of undifferentiated disease	Musculoskeletal Health
Asthma: Under 5	311	New presentation of undifferentiated disease	Respiratory Health
Anabolic Steroid Abuse	312	Investigation / Results, "Mental health, including addiction, smoking, alcohol, substance misuse"	"Smoking, Alcohol and Substance Misuse"
Insomnia: Child	313	Patient less than 19 years old, New presentation of undifferentiated disease	Neurodevelopmental Conditions and Neurodiversity
Haemophilia: Genetics	314	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Genomic Medicine
Contraception: Post Breast Cancer	315	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Neutropenia: Ethnic Variation	316	Investigation / Results, "Ethnicity, culture, diversity, inclusivity"	Haematology
Itch: Haematological Cancer	317	New presentation of undifferentiated disease, Urgent and Unscheduled care	Haematology, Dermatology
Phobia: Diazepam Request	318	Prescribing	Mental Health
Thrush: Vulvovaginitis	319	Patient less than 19 years old, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Suspected Lung Ca: DOAC	320	"Long-term condition, including cancer, multi-morbidity, and disability", Prescribing	Respiratory Health, Cardiovascular Health
Acute Crisis: Diazepam	321	"Mental health, including addiction, smoking, alcohol, substance misuse", Prescribing	Mental Health
Infant Weight Gain	322	Patient less than 19 years old	Metabolic Problems and Endocrinology
Faltering Growth: Coeliac	323	Patient less than 19 years old, New presentation of undifferentiated disease	Gastroenterology
Human Bite: Blood Borne Infection Risk	324	New presentation of undifferentiated disease, Prescribing	Infectious Diseases and Travel Health, Dermatology
Anaemia: Iron Deficiency	325	Investigation / Results, New presentation of undifferentiated disease	Gastroenterology, Haematology
B12 'Deficiency'	326	Prescribing	Haematology
MND: Bulbar ALS	327	New presentation of undifferentiated disease, "Older adults, including frailty and people at the end of life"	Neurology
Pelvic Inflammatory Disease	328	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast, Sexual Health
STI: Transgender	329	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Patient less than 19 years old, "Ethnicity, culture, diversity, inclusivity"	Sexual Health, Infectious Diseases and Travel Health
Hyperkalaemia	330	Investigation / Results	Haematology
HIV: Teenager	331	New presentation of undifferentiated disease	Infectious Diseases and Travel Health, Sexual Health
Contraception: GLP-1	332	Prescribing, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Breastfeeding & Thrush	333	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Dermatology, Maternity and Reproductive Health
Delay Period: Liver Disease	334	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
Baby Blues	335	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Maternity and Reproductive Health
Postnatal Depression	336	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Maternity and Reproductive Health
Subclinical Hyperthyroidism	337	Investigation / Results	Metabolic Problems and Endocrinology
Thickened Endometrium	338	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Back Pain - Bereavement	339	New presentation of undifferentiated disease, "Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health, Musculoskeletal Health
Sterile Pyuria: Schistosomiasis	340	Investigation / Results, New presentation of undifferentiated disease	Infectious Diseases and Travel Health, Renal and Urology
Sterile Pyuria: STI	341	Investigation / Results, "Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health, Renal and Urology
Group B Strep in Pregnancy	342	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Maternity and Reproductive Health, Gynaecology and Breast
Oligospermia	343	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Maternity and Reproductive Health
Juvenile Idopathic Arthritis (JIA)	344	New presentation of undifferentiated disease, Patient less than 19 years old	Musculoskeletal Health
Contraception: Emergency (2)	345	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Sexual Health
Thrush in Pregnancy	346	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Prescribing	Gynaecology and Breast
Recurrent Vulvovaginal Candidiasis	347	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast"	Gynaecology and Breast
Premature Ovarian Failure	348	"Gender, reproductive and sexual health, including women's, men's, LGBTQ+, gynae and breast", Investigation / Results	Gynaecology and Breast, Maternity and Reproductive Health
Psoriatic Arthritis	349	"Long-term condition, including cancer, multi-morbidity, and disability", New presentation of undifferentiated disease	Musculoskeletal Health, Dermatology
Schizophrenia Relapse	350	"Mental health, including addiction, smoking, alcohol, substance misuse"	Mental Health
Thrombocytosis: Lung Ca	351	Investigation / Results, New presentation of undifferentiated disease	Respiratory Health, Haematology
  `;

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
  function normKey(s){
    return String(s ?? "")
      .trim()
      .replace(/[“”]/g, '"')
      .replace(/\s+/g, " ")
      .toLowerCase();
  }

  function buildLookup(canonList){
    const m = new Map();
    for (const label of canonList){
      m.set(normKey(label), label);
      m.set(normKey(label).replace(/,/g, ""), label);
    }
    return m;
  }

  const TOPIC_LOOKUP = buildLookup(TOPICS);
  const GROUP_LOOKUP = buildLookup(EXPERIENCE_GROUPS);

  // Extra topic aliases you actually have in your data
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

  // Domain/group alias you have in your data (capitalisation mismatch)
  const GROUP_ALIASES = new Map([
    [normKey("Urgent and Unscheduled care"), "Urgent and unscheduled care"]
  ]);

  // Parse comma-separated lists, respecting quotes.
  // Examples it handles:
  //   a, b, "c, d"
  //   "Long-term condition, including cancer, multi-morbidity, and disability", Prescribing
  function splitCsvRespectQuotes(input){
    const s = String(input ?? "").trim();
    if (!s) return [];

    let out = [];
    let cur = "";
    let inQ = false;

    for (let i = 0; i < s.length; i++){
      const ch = s[i];

      if (ch === '"'){
        inQ = !inQ;
        continue;
      }

      if (!inQ && ch === ","){
        const token = cur.trim();
        if (token) out.push(token);
        cur = "";
        continue;
      }

      cur += ch;
    }

    const last = cur.trim();
    if (last) out.push(last);

    // final clean: trim + remove wrapping quotes (just in case)
    out = out
      .map(t => String(t).trim().replace(/^"(.*)"$/, "$1").trim())
      .filter(Boolean);

    return out;
  }

  function canonTopicLabel(rawLabel){
    const k = normKey(rawLabel);
    if (TOPIC_ALIASES.has(k)) return TOPIC_ALIASES.get(k);
    return TOPIC_LOOKUP.get(k) || TOPIC_LOOKUP.get(k.replace(/,/g, "")) || rawLabel.trim();
  }

  function canonGroupLabel(rawLabel){
    const k = normKey(rawLabel);
    if (GROUP_ALIASES.has(k)) return GROUP_ALIASES.get(k);
    return GROUP_LOOKUP.get(k) || GROUP_LOOKUP.get(k.replace(/,/g, "")) || rawLabel.trim();
  }

  function uniqClean(arr){
    const seen = new Set();
    const out = [];
    for (const v of (arr || [])){
      const s = String(v ?? "").trim();
      if (!s) continue;
      const k = normKey(s);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }
    return out;
  }

  function parseCaseTsv(tsv){
    const lines = String(tsv || "")
      .split(/\r?\n/)
      .map(l => l.trimEnd())
      .filter(Boolean);

    const out = [];

    for (const line of lines){
      const cols = line.split("\t");
      if (cols.length < 4) continue;

      const name = String(cols[0] ?? "").trim();
      const id = Number(String(cols[1] ?? "").trim());
      if (!Number.isFinite(id)) continue;

      const groupsRaw = cols[2];
      const topicsRaw = cols[3];

      const groups = uniqClean(splitCsvRespectQuotes(groupsRaw)).map(canonGroupLabel);
      const topics = uniqClean(splitCsvRespectQuotes(topicsRaw)).map(canonTopicLabel);

      out.push({ id, name, groups, topics });
    }

    return out;
  }

  // ✅ This is the mapping your Squarespace script expects now:
  // [{ id, name, groups: [...], topics: [...] }, ...]
  window.SCA_CASE_MAP = parseCaseTsv(CASE_TSV);

  console.log("SCA_CASE_MAP length:", window.SCA_CASE_MAP.length);
  console.log("SCA_CASE_MAP sample:", window.SCA_CASE_MAP.slice(0, 5));

});

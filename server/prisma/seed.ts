import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

/**
 * Seeds the shared syllabus templates that Phase 2 clones into a student's exam.
 * Only touches SyllabusTemplate, so it is safe to re-run against real user data.
 */

interface TemplateTopic {
  name: string;
  children?: TemplateTopic[];
}

interface TemplateSubject {
  name: string;
  weightage: number;
  topics: TemplateTopic[];
}

interface TemplateStructure {
  subjects: TemplateSubject[];
}

const sscCgl: TemplateStructure = {
  subjects: [
    {
      name: 'Quantitative Aptitude',
      weightage: 25,
      topics: [
        { name: 'Number System' },
        { name: 'Percentage' },
        { name: 'Profit & Loss' },
        { name: 'Ratio & Proportion' },
        { name: 'Average' },
        { name: 'Time, Speed & Distance' },
        { name: 'Time & Work' },
        { name: 'Simple & Compound Interest' },
        { name: 'Algebra' },
        { name: 'Geometry' },
        { name: 'Trigonometry' },
        { name: 'Mensuration' },
        { name: 'Data Interpretation' },
      ],
    },
    {
      name: 'Reasoning',
      weightage: 25,
      topics: [
        { name: 'Analogy' },
        { name: 'Classification' },
        { name: 'Series' },
        { name: 'Coding-Decoding' },
        { name: 'Blood Relations' },
        { name: 'Direction Sense' },
        { name: 'Syllogism' },
        { name: 'Seating Arrangement' },
        { name: 'Non-Verbal Reasoning' },
      ],
    },
    {
      name: 'English Language',
      weightage: 25,
      topics: [
        { name: 'Reading Comprehension' },
        { name: 'Grammar & Error Spotting' },
        { name: 'Fill in the Blanks' },
        { name: 'Synonyms & Antonyms' },
        { name: 'Idioms & Phrases' },
        { name: 'Sentence Improvement' },
        { name: 'Para Jumbles' },
        { name: 'Cloze Test' },
      ],
    },
    {
      name: 'General Awareness',
      weightage: 25,
      topics: [
        { name: 'Indian Polity' },
        { name: 'Indian History' },
        { name: 'Geography' },
        { name: 'Economics' },
        { name: 'General Science' },
        { name: 'Static GK' },
        { name: 'Current Affairs' },
      ],
    },
  ],
};

const upscPrelims: TemplateStructure = {
  subjects: [
    {
      name: 'General Studies Paper I',
      weightage: 50,
      topics: [
        { name: 'Indian Polity & Governance' },
        { name: 'Modern Indian History' },
        { name: 'Ancient & Medieval History' },
        { name: 'Art & Culture' },
        { name: 'Indian & World Geography' },
        { name: 'Economic & Social Development' },
        { name: 'Environment & Ecology' },
        { name: 'General Science & Technology' },
        { name: 'Current Events' },
      ],
    },
    {
      name: 'CSAT Paper II',
      weightage: 50,
      topics: [
        { name: 'Comprehension' },
        { name: 'Logical Reasoning' },
        { name: 'Analytical Ability' },
        { name: 'Basic Numeracy' },
        { name: 'Decision Making' },
      ],
    },
  ],
};

const keralaPsc: TemplateStructure = {
  subjects: [
    {
      name: 'General Knowledge & Current Affairs',
      weightage: 30,
      topics: [
        { name: 'Kerala Renaissance' },
        { name: 'Indian National Movement' },
        { name: 'Kerala History' },
        { name: 'Current Affairs' },
        { name: 'Sports & Awards' },
      ],
    },
    {
      name: 'General Science',
      weightage: 20,
      topics: [{ name: 'Physics' }, { name: 'Chemistry' }, { name: 'Biology' }],
    },
    {
      name: 'Quantitative Aptitude & Mental Ability',
      weightage: 25,
      topics: [
        { name: 'Number System' },
        { name: 'Percentage' },
        { name: 'Simple & Compound Interest' },
        { name: 'Mental Ability' },
      ],
    },
    {
      name: 'Language',
      weightage: 25,
      topics: [{ name: 'English Grammar' }, { name: 'Malayalam' }, { name: 'Translation' }],
    },
  ],
};

const templates = [
  {
    examName: 'SSC CGL',
    description: 'Staff Selection Commission Combined Graduate Level - Tier I & II',
    structure: sscCgl,
  },
  {
    examName: 'UPSC Civil Services (Prelims)',
    description: 'Union Public Service Commission Preliminary Examination',
    structure: upscPrelims,
  },
  {
    examName: 'Kerala PSC (Degree Level)',
    description: 'Kerala Public Service Commission degree-level preliminary syllabus',
    structure: keralaPsc,
  },
];

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  for (const template of templates) {
    const topicCount = template.structure.subjects.reduce((n, s) => n + s.topics.length, 0);
    await prisma.syllabusTemplate.upsert({
      where: { examName: template.examName },
      update: { description: template.description, structure: template.structure },
      create: {
        examName: template.examName,
        description: template.description,
        structure: template.structure,
      },
    });
    console.log(
      `  seeded ${template.examName} (${template.structure.subjects.length} subjects, ${topicCount} topics)`,
    );
  }
}

main()
  .then(() => console.log('Seed complete.'))
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  })
  .finally(() => void prisma.$disconnect());

import { db, addNode, addEdge } from './db';
import type { Node } from './types';

async function seedDatabase() {
  const count = await db.nodes.count();
  if (count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');

  try {
    // --- Level 1: Branches ---
    const analysisBranch: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'Branch',
      title: 'Mathematical Analysis',
      content: 'The study of limits and related theories, such as differentiation, integration, measure, infinite series, and analytic functions.',
      parentId: null,
      children: [],
    };
    const analysisBranchId = await addNode(analysisBranch);

    // --- Level 2: Major Chapters ---
    const chapter1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MajorChapter',
        title: 'Sets and Mappings',
        content: 'This chapter introduces the fundamental concepts of sets and mappings.',
        parentId: analysisBranchId,
        children: [],
    };
    const chapter1Id = await addNode(chapter1);

    // Update parent's children array
    await db.nodes.update(analysisBranchId, { children: [chapter1Id] });

    // --- Level 3: Minor Chapters ---
    const minorChapter1_1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MinorChapter',
        title: 'Sets',
        content: 'Basic concepts of sets.',
        parentId: chapter1Id,
        children: [],
    };
    const minorChapter1_1Id = await addNode(minorChapter1_1);

    const minorChapter1_2: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MinorChapter',
        title: 'Mappings',
        content: 'Introduction to mappings and functions.',
        parentId: chapter1Id,
        children: [],
    };
    const minorChapter1_2Id = await addNode(minorChapter1_2);
    
    // Update parent's children array
    await db.nodes.update(chapter1Id, { children: [minorChapter1_1Id, minorChapter1_2Id] });

    // --- Level 4: Definitions/Theorems in a Minor Chapter ---
    const definition1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'Definition',
        title: 'Definition of a Set',
        content: 'A set is a well-defined collection of distinct objects, considered as an object in its own right.',
        parentId: minorChapter1_1Id,
        children: [],
    };
    const definition1Id = await addNode(definition1);

    const theorem1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'Theorem',
        title: 'De Morgan\'s Laws',
        content: 'Statement of De Morgan\'s laws for sets.',
        parentId: minorChapter1_1Id,
        children: [],
    };
    const theorem1Id = await addNode(theorem1);

    // Update parent's children array
    await db.nodes.update(minorChapter1_1Id, { children: [definition1Id, theorem1Id] });

    // --- Level 5: Edges ---
    await addEdge({
        source: theorem1Id,
        target: definition1Id,
        label: 'references',
    });

    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

export { seedDatabase };

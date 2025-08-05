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
      title: '数学分析',
      content: '研究极限及相关理论，如微分、积分、测度、无穷级数和解析函数。',
      parentId: null,
      children: [],
    };
    const analysisBranchId = await addNode(analysisBranch);

    // --- Level 2: Major Chapters ---
    const chapter1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MajorChapter',
        title: '集合与映射',
        content: '本章介绍集合与映射的基本概念。',
        parentId: analysisBranchId,
        children: [],
    };
    const chapter1Id = await addNode(chapter1);

    // Update parent's children array
    await db.nodes.update(analysisBranchId, { children: [chapter1Id] });

    // --- Level 3: Minor Chapters ---
    const minorChapter1_1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MinorChapter',
        title: '集合',
        content: '集合的基本概念。',
        parentId: chapter1Id,
        children: [],
    };
    const minorChapter1_1Id = await addNode(minorChapter1_1);

    const minorChapter1_2: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MinorChapter',
        title: '映射',
        content: '映射与函数介绍。',
        parentId: chapter1Id,
        children: [],
    };
    const minorChapter1_2Id = await addNode(minorChapter1_2);
    
    // Update parent's children array
    await db.nodes.update(chapter1Id, { children: [minorChapter1_1Id, minorChapter1_2Id] });

    // --- Level 4: Definitions/Theorems in a Minor Chapter ---
    const definition1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'Definition',
        title: '集合的定义',
        content: '集合是明确定义的不同对象的集合，其本身被视为一个对象。',
        parentId: minorChapter1_1Id,
        children: [],
    };
    const definition1Id = await addNode(definition1);

    const theorem1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'Theorem',
        title: '德摩根定律',
        content: '集合的德摩根定律陈述。',
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
        label: '引用',
    });

    // --- Another Branch: Probability Theory ---
    const probBranch: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
      type: 'Branch',
      title: '概率论',
      content: '研究事件发生可能性的数值描述的数学分支。',
      parentId: null,
      children: [],
    };
    const probBranchId = await addNode(probBranch);

    const probChapter1: Omit<Node, 'id' | 'createdAt' | 'updatedAt'> = {
        type: 'MajorChapter',
        title: '基本概念',
        content: '概率论的基本概念。',
        parentId: probBranchId,
        children: [],
    };
    const probChapter1Id = await addNode(probChapter1);
    await db.nodes.update(probBranchId, { children: [probChapter1Id] });


    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

export { seedDatabase };

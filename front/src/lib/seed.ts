import { db, addNode, addEdge } from './db';
import type { Node } from './types';

// 一个辅助函数，用于减少重复的父子关系更新代码
async function addNodeAndUpdateParent(
  nodeData: Omit<Node, 'id' | 'createdAt' | 'updatedAt'>,
  parentChildren: string[]
): Promise<string> {
  const nodeId = await addNode(nodeData);
  if (nodeData.parentId) {
    await db.nodes.update(nodeData.parentId, { children: [...parentChildren, nodeId] });
  }
  return nodeId;
}


async function seedDatabase() {
  const count = await db.nodes.count();
  if (count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');

  try {
    // =================================================================
    // --- 分支 1: 数学分析 ---
    // =================================================================
    const analysisBranchId = await addNode({
      type: '分支',
      title: '数学分析',
      content: '研究极限及相关理论，如微分、积分、测度、无穷级数和解析函数。',
      parentId: null,
      children: [],
      tags: ['核心数学'],
    });

    // --- 主章节 1.1: 集合与映射 ---
    const chapter1Id = await addNodeAndUpdateParent({
      type: '主章节',
      title: '集合与映射',
      content: '本章介绍集合与映射的基本概念，它们是构建整个数学分析大厦的基础。',
      parentId: analysisBranchId,
      children: [],
    }, []); // analysisBranch 还没有子节点，所以是空数组

    // --- 子章节 1.1.1: 集合 ---
    const minorChapter1_1Id = await addNodeAndUpdateParent({
      type: '子章节',
      title: '集合',
      content: '集合的基本概念、运算和性质。',
      parentId: chapter1Id,
      children: [],
    }, []);

    // --- 子章节 1.1.1 下的内容 ---
    const definition1Id = await addNodeAndUpdateParent({
      type: '定义',
      title: '集合的定义',
      content: '集合是明确定义的不同对象的集合，其本身被视为一个对象。元素具有无序性和互异性。',
      parentId: minorChapter1_1Id,
      children: [],
      tags: ['基础概念', '集合论'],
      aliases: ['Set'],
      source: '《陶哲轩实分析》第一章',
    }, []);

    const theorem1Id = await addNodeAndUpdateParent({
      type: '定理',
      title: '德摩根定律',
      content: `对于任意两个集合$A$ 和 $B$，有以下等式：\n$$\n(A \\cup B)' = A' \\cap B' \\\\\n(A \\cap B)' = A' \\cup B'\n$$`,
      solution: `证明：\n1. 对于任意元素 $x$，如果 $x \\in (A \\cup B)'$，则 $x \\notin A \\cup B$，即 $x \\notin A$ 且 $x \\notin B$，因此 $x \\in A'$ 且 $x \\in B'$，所以 $x \\in A' \\cap B'$。\n2. 类似地，对于 $(A \\cap B)'$ 的证明。`,
      parentId: minorChapter1_1Id,
      children: [],
      tags: ['集合论', '逻辑'],
    }, [definition1Id]);

    const example1Id = await addNodeAndUpdateParent({
      type: '例题',
      title: '德摩根定律应用',
      content: `设 $A = \\{1, 2, 3\\}$ 和 $B = \\{2, 3, 4\\}$，求 $(A \\cup B)'$ 和 $(A \\cap B)'$ 的结果。\n\n`,
      solution: `解：\n1. $A \\cup B = \\{1, 2, 3, 4\\}$，因此 $(A \\cup B)' = \\{\\text{所有不在 } A \\cup B 的元素\\}$。\n2. $A \\cap B = \\{2, 3\\}$，因此 $(A \\cap B)' = \\{\\text{所有不在 } A \\cap B 的元素\\}$。`,
      parentId: theorem1Id, // 作为定理的例题
      children: [],
    }, []);

    const note1Id = await addNodeAndUpdateParent({
        type: '笔记',
        title: '关于德摩根定律的思考',
        content: '德摩根定律不仅在集合论中重要，它在布尔代数和数字电路设计中也有完全相同的形式，是逻辑否定的基本规则。',
        parentId: theorem1Id, // 挂载到定理下
        children: [],
    }, [example1Id]);

    // --- 在子章节末尾创建“习题”笔记 ---
    const exercisesNoteId = await addNodeAndUpdateParent({
      type: '笔记',
      title: '习题',
      content: '本章节相关练习题。',
      parentId: minorChapter1_1Id,
      children: [],
    }, [definition1Id, theorem1Id]);

    // --- 将练习题挂载到“习题”笔记下 ---
    const exercise1Id = await addNodeAndUpdateParent({
        type: '练习',
        title: '幂集大小',
        content: '一个有 n 个元素的有限集合，其幂集（所有子集构成的集合）有多少个元素？',
        solution: '$$2^n$$。因为对于每个元素，我们都可以选择“包含”或“不包含”在子集中，两种选择，总共有 n 个元素，因此是 2 的 n 次方。',
        parentId: exercisesNoteId, // 挂载到“习题”笔记下
        children: [],
    }, []);

    const solutionRecord1Id = await addNodeAndUpdateParent({
        type: '解题记录',
        title: '我对“幂集大小”的解法',
        content: '我的初步想法是 n*n，因为感觉是两两组合。但这个思路很快就发现不对。',
        solution: '后来参考了答案，理解了每个元素都有“在”或“不在”子集中这两种状态，所以是 2^n。这个思路非常巧妙，需要记住。',
        parentId: example1Id, // 挂载到例题下
        children: [],
    }, []);

    // =================================================================
    // --- 分支 2: 线性代数 ---
    // =================================================================
    const linalgBranchId = await addNode({
      type: '分支',
      title: '线性代数',
      content: '研究向量空间、线性变换和有限维线性方程组。',
      parentId: null,
      children: [],
      tags: ['核心数学', '代数'],
    });

    const linalgChapter1Id = await addNodeAndUpdateParent({
      type: '主章节',
      title: '向量空间',
      content: '向量空间的定义、子空间、基与维数。',
      parentId: linalgBranchId,
      children: [],
    }, []);

    const vectorSpaceDefId = await addNodeAndUpdateParent({
      type: '定义',
      title: '向量空间',
      content: '一个向量空间（或线性空间）是一个由称为向量的元素组成的集合，其中定义了两种运算：向量加法和标量乘法，并满足八条公理。',
      parentId: linalgChapter1Id,
      children: [],
      tags: ['核心概念', '抽象代数'],
      source: '《Linear Algebra Done Right》 by Sheldon Axler',
    }, []);

    // =================================================================
    // --- 建立边（Edges），构建知识图谱 ---
    // =================================================================
    console.log('Adding edges...');

    // 德摩根定律“引用”了集合的定义
    await addEdge({
      source: theorem1Id,
      target: definition1Id,
      label: '引用',
      description: '德摩根定律是关于集合运算的，因此其证明和理解依赖于集合的基本定义。',
    });

    // 例题是定理的例题
    await addEdge({ source: example1Id, target: theorem1Id, label: '是...的例题' });
    
    // 练习题是定义的练习题
    await addEdge({ source: exercise1Id, target: definition1Id, label: '是...的练习题' });

    // 解题记录是练习题的解题记录
    await addEdge({ source: solutionRecord1Id, target: exercise1Id, label: '是...的解题记录' });

    // 笔记引用了德摩根定律
    await addEdge({ source: note1Id, target: theorem1Id, label: '引用' });

    // --- 跨学科的引用！---
    const crossDisciplineNoteId = await addNodeAndUpdateParent({
        type: '笔记',
        title: '函数的向量空间',
        content: '所有从实数域 R 到 R 的连续函数集合，在函数加法和标量乘法下，可以构成一个无穷维的向量空间。这是泛函分析的起点。',
        parentId: chapter1Id, // 放在数学分析的“集合与映射”章节下
        children: [],
    }, [minorChapter1_1Id]); // 假设放在子章节1.1之后

    await addEdge({
      source: crossDisciplineNoteId,
      target: vectorSpaceDefId, // 目标是线性代数中的“向量空间”定义
      label: '引用',
      description: '此概念将分析学中的“函数”与代数学中的“向量空间”联系起来。',
    });


    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

export { seedDatabase };

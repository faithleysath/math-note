import { db, importData } from './db';
import type { Node, Edge } from './types';

const data: { nodes: Node[]; edges: Edge[] } = {
  "nodes": [
    {
      "id": "0223306b-fc82-4411-9240-2f308cbc97be",
      "title": "初等函数",
      "type": "笔记",
      "content": "### 基本初等函数\n- 常数函数：$y=c$\n- 幂函数：$y=x^\\alpha(\\alpha\\in\\mathbf R)$\n- 指数函数：$y=a^x(a>0\\;\\text{且}\\;a\\neq1)$\n- 对数函数：$y=\\log_ax(a>0\\;\\text{且}\\;a\\neq1)$\n- 三角函数：如 $y=\\sin x,\\;y=\\cos x,\\; y=\\tan x,\\;y=\\cot x$ 等\n- 反三角函数：如 $y=\\arcsin x,\\;y=\\arccos x,\\;y=\\arctan x$等\n\n这 $6$ 类函数统称为**基本初等函数**.\n\n### 初等函数\n由基本初等函数经过有限次四则运算与复合运算产生的函数称为**初等函数.**",
      "parentId": "2524c490-4e2d-4866-aa37-d33a2e716d29",
      "children": [],
      "createdAt": 1754876218782,
      "updatedAt": 1754879099375,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "1af81caa-20df-4374-b670-99e0cc19292f",
      "title": "幂集",
      "type": "定义",
      "content": "设 $A$ 是一个集合，由 $A$ 的所有子集所组成的集合，称为 $A$ 的**幂集**，记作 $\\mathcal{P}(A)$ 或 $2^A$，$\\mathcal{P}(A)=\\{S \\mid S\\subseteq A\\}$.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754872517088,
      "updatedAt": 1754872798522,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "2524c490-4e2d-4866-aa37-d33a2e716d29",
      "title": "映射与函数",
      "type": "子章节",
      "content": "映射是两个集合之间的一种对应关系.",
      "parentId": "bb29507c-18d4-4d8e-bf93-35d25f323e6c",
      "children": [
        "77b37a7c-b8da-41e0-a330-118de827fbef",
        "98705c80-f543-4839-8ab9-707dda389dad",
        "e42f3698-f5a6-41a2-82d1-d56f5a2fcd70",
        "0223306b-fc82-4411-9240-2f308cbc97be",
        "ed9e6c24-71fa-4f4c-be89-ea39ae45817f"
      ],
      "createdAt": 1754874554352,
      "updatedAt": 1754878298107,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "2627195f-b6ee-4d09-b53f-2512c26165af",
      "title": "集合的差",
      "type": "定义",
      "content": "$S\\ \\backslash\\  T=\\{x \\mid x\\in S \\; \\text{并且}\\; x\\not\\in T\\}$.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754874396302,
      "updatedAt": 1754879044743,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "2f2c5812-0fdf-4605-87f5-6e776677b892",
      "title": "自然数集N",
      "type": "定义",
      "content": "$\\mathbf{N}=\\{0,1,2,\\cdots,n,\\cdots\\}$",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754533314563,
      "updatedAt": 1754533359898,
      "solution": "",
      "tags": [
        "集合",
        "常用集合"
      ],
      "source": ""
    },
    {
      "id": "654ae395-22c0-4872-972d-ec0e9ca79e3b",
      "title": "子集",
      "type": "定义",
      "content": "设 $S$ , $T$ 是两个集合，如果$S$的所有元素都属于$T$，即\n$$\nx\\in S \\implies x\\in T\n$$\n&emsp;&emsp;则称 $S$ 是 $T $ 的**子集**，记为 $S\\subseteq T$，若 $S\\neq T$，则 $S\\subset T$，$S$ 是 $T$ 的**真子集**.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754787218937,
      "updatedAt": 1754872302052,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "75ec5f9f-7533-4fc7-8d34-c96cdeadd796",
      "title": "集合相等",
      "type": "定理",
      "content": "$S=T \\iff S\\subseteq T\\;\\;\\text{并且}\\;\\;T\\subseteq S$",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754873144044,
      "updatedAt": 1754879001521,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "77b37a7c-b8da-41e0-a330-118de827fbef",
      "title": "映射",
      "type": "定义",
      "content": "设 $X,Y$ 是两个给定的集合，若按照某种规则 $f$ ，使得对集合 $X$ 中对每一个元素 $x$，都可以找到集合 $Y$ 中唯一确定的元素 $y$ 与之对应，则称这个对应规则 $f$ 是集合 $X$ 到集合 $Y$ 的一个**映射** ，记为\n$$\nf:X\\to Y.\n$$\n其中 $y$ 称为在映射 $f$ 之下 $x$ 的**像**，$x$ 称为在映射 $f$ 之下 $y$ 的一个**逆像**（也称为**原像**）. 集合 $X$ 称为映射 $f$ 的**定义域**，记为 $D_f$. 而在映射 $f$ 之下，$X$ 中元素 $x$ 的像 $y$ 的全体称为映射 $f$ 的**值域**，记为 $R_f$，即\n$$\nR_f = \\{y \\mid y\\in Y \\;\\text{并且}\\;y=f(x),\\; x\\in X\\}.\n$$",
      "parentId": "2524c490-4e2d-4866-aa37-d33a2e716d29",
      "children": [],
      "createdAt": 1754874668705,
      "updatedAt": 1754879069475,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "80a13fb9-a74d-4966-a0b3-47bf5cac2855",
      "title": "不是子集",
      "type": "定义",
      "content": "如果 $S$ 中至少存在一个元素 $x$ 不属于 $T$，即 $x\\in S$ 但 $x\\not\\in T$，那么 $S$ 不是 $T$ 的子集，记为 $S\\not \\subset T$.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754872117368,
      "updatedAt": 1754872222435,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "98705c80-f543-4839-8ab9-707dda389dad",
      "title": "映射的类型",
      "type": "定义",
      "content": "设 $f$ 是集合 $X$ 到集合 $Y$ 的一个映射，若 $f$ 的逆像也具有唯一性，即对 $X$ 中的任意两个不同元素 $x_1\\neq x_2$，它们的像 $y_1$ 与 $y_2$ 也满足 $y_1\\neq y_2$，则称 $f$ 为**单射**；如果映射 $f$ 满足 $R_f=Y$，则称 $f$ 为**满射**；如果映射 $f$ 既是单射，又是满射，则称 $f$ 是**双射**（又称**一一对应**）.",
      "parentId": "2524c490-4e2d-4866-aa37-d33a2e716d29",
      "children": [],
      "createdAt": 1754875426774,
      "updatedAt": 1754875766562,
      "solution": "",
      "tags": [
        "单射",
        "满射",
        "双射",
        "一一对应"
      ],
      "source": ""
    },
    {
      "id": "9a885d97-abbe-48c9-87c7-a168b5b821d7",
      "title": "幂集元素的数量",
      "type": "定理",
      "content": "由 $n$ 个元素组成的集合 $T$ 共有 $2^n$ 个子集.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754872900173,
      "updatedAt": 1754873095525,
      "solution": "数学归纳法。或从 “每个元素是否被选入子集” 的角度分析。",
      "tags": [
        "幂集"
      ],
      "source": ""
    },
    {
      "id": "ab892ec6-3a97-44bf-ab4a-d6f9ecde3849",
      "title": "有理数集Q",
      "type": "定义",
      "content": "$\\mathbf{Q}=\\left\\{x\\left | x=\\dfrac qp,\\;\\text{其中}\\;p\\in\\mathbf{N}^+\\ \\text{并且}\\;q\\in\\mathbf{Z}\\right.\\right\\}$",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754532809494,
      "updatedAt": 1754878965515,
      "solution": "",
      "tags": [
        "集合",
        "常用集合"
      ],
      "source": ""
    },
    {
      "id": "b11529fc-0dfe-44fd-a8c5-7518a39ec398",
      "title": "数学分析",
      "type": "分支",
      "content": "",
      "parentId": null,
      "children": [
        "bb29507c-18d4-4d8e-bf93-35d25f323e6c"
      ],
      "createdAt": 1754531884240,
      "updatedAt": 1754531905774
    },
    {
      "id": "b9323d88-d258-45f2-9a9c-a667fa50a1f6",
      "title": "集合的并",
      "type": "定义",
      "content": "$S\\cup T=\\{x \\mid x\\in S \\; \\text{或者} \\; x\\in T\\}$.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754873639879,
      "updatedAt": 1754879026861,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "b9447785-e355-48e8-982a-3e37c7ae7af4",
      "title": "集合的交",
      "type": "定义",
      "content": "$S\\cap T=\\{x \\mid x\\in S\\;\\text{并且}\\;x\\in T\\}$.",
      "parentId": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "children": [],
      "createdAt": 1754873744912,
      "updatedAt": 1754879035460,
      "solution": "",
      "tags": [],
      "source": ""
    },
    {
      "id": "bb29507c-18d4-4d8e-bf93-35d25f323e6c",
      "title": "集合与映射",
      "type": "主章节",
      "content": "集合与映射奠定了实数系的基础",
      "parentId": "b11529fc-0dfe-44fd-a8c5-7518a39ec398",
      "children": [
        "4527aac5-ded5-41b0-ab8f-6771ba96a677",
        "f2f85bb7-8e54-48bf-b860-a660089e25c2",
        "2524c490-4e2d-4866-aa37-d33a2e716d29"
      ],
      "createdAt": 1754531905771,
      "updatedAt": 1754874554356,
      "solution": "",
      "tags": [
        "集合",
        "映射",
        "实数系"
      ],
      "source": "数学分析 第三版 陈纪修"
    },
    {
      "id": "e42f3698-f5a6-41a2-82d1-d56f5a2fcd70",
      "title": "一元实函数",
      "type": "定义",
      "content": "若将映射特殊地取集合 $X\\subseteq \\mathbf{R}$，集合 $Y=\\mathbf{R}$，则映射称为**一元实函数**，简称**函数**.",
      "parentId": "2524c490-4e2d-4866-aa37-d33a2e716d29",
      "children": [],
      "createdAt": 1754875881062,
      "updatedAt": 1754876020447,
      "solution": "",
      "tags": [
        "函数",
        "一元实函数"
      ],
      "source": ""
    },
    {
      "id": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "title": "集合",
      "type": "子章节",
      "content": "具有某种特定性质的具体的或抽象的对象汇集成的总体",
      "parentId": "bb29507c-18d4-4d8e-bf93-35d25f323e6c",
      "children": [
        "ab892ec6-3a97-44bf-ab4a-d6f9ecde3849",
        "955f3e2b-203a-46c6-b887-c4032fbed42b",
        "2f2c5812-0fdf-4605-87f5-6e776677b892",
        "654ae395-22c0-4872-972d-ec0e9ca79e3b",
        "80a13fb9-a74d-4966-a0b3-47bf5cac2855",
        "1af81caa-20df-4374-b670-99e0cc19292f",
        "9a885d97-abbe-48c9-87c7-a168b5b821d7",
        "75ec5f9f-7533-4fc7-8d34-c96cdeadd796",
        "b9323d88-d258-45f2-9a9c-a667fa50a1f6",
        "b9447785-e355-48e8-982a-3e37c7ae7af4",
        "2627195f-b6ee-4d09-b53f-2512c26165af",
        "1a8002ac-5ee0-49a2-9352-f6db9f5d52bb"
      ],
      "createdAt": 1754532600759,
      "updatedAt": 1754874396306,
      "solution": "",
      "tags": [
        "集合"
      ],
      "source": "数学分析 第三版 陈纪修"
    }
  ],
  "edges": [
    {
      "id": "c66958e2-f49e-4d50-b484-9e9913c881ab",
      "source": "e42f3698-f5a6-41a2-82d1-d56f5a2fcd70",
      "target": "77b37a7c-b8da-41e0-a330-118de827fbef",
      "label": "依赖"
    },
    {
      "id": "f13803b7-cbaa-4697-bfbd-2e037e36bc3f",
      "source": "98705c80-f543-4839-8ab9-707dda389dad",
      "target": "f2f85bb7-8e54-48bf-b860-a660089e25c2",
      "label": "依赖"
    }
  ]
};

async function seedDatabase() {
  const count = await db.nodes.count();
  if (count > 0) {
    console.log('Database already seeded.');
    return;
  }

  console.log('Seeding database...');

  try {
    await importData(data);
    console.log('Database seeded successfully!');
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}

export { seedDatabase };

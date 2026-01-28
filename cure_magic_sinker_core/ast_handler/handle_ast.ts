/** 因为当前 @swc/wasm-web 不支持 wasm 插件，
 * 所以使用 @swc/wasm-web 生成 AST 之后，用 js 去操作 AST，完成 hook。
 *
 * 这么做的原因是为了在网页中处理**动态生成的 js**。
 *
 * 具体见 `doc/design.md` 中 `JS 操作 AST` 部分的详细说明。
 *
 * 警告！不同版本的 swc 生成的 AST 我无法确定是否相同！
 */

import {
    Node,
    Statement,
    Program,
    Expression,
    Literal,
    CallExpression,
    Identifier,
    VariableDeclarator,
    Argument,
    CatchClause,
} from "@swc/wasm-web";

// #region 类型定义

type AllStatementType = Statement["type"];
type AllExpressionType = Expression["type"];
type AllLiteralType = Literal["type"];
type AllNodeType =
    | AllStatementType
    | AllExpressionType
    | AllLiteralType
    | "VariableDeclarator"
    | "CatchClause";

type DiscriminatedUnionToMap<U extends { type: string }> = {
    [K in U as K["type"]]: Extract<U, { type: K["type"] }>;
};

type StatementTypeMap = DiscriminatedUnionToMap<Statement>;
type ExpressionTypeMap = DiscriminatedUnionToMap<Expression>;
type LiteralTypeMap = DiscriminatedUnionToMap<Literal>;

type StatementVisitors = {
    [K in AllStatementType]?: (node: StatementTypeMap[K]) => void;
};

type ExpressionVisitors = {
    [K in AllExpressionType]?: (node: ExpressionTypeMap[K]) => void;
};

type LiteralVisitors = {
    [K in AllLiteralType]?: (node: LiteralTypeMap[K]) => void;
};

export interface Visitor
    extends StatementVisitors, ExpressionVisitors, LiteralVisitors {
    VariableDeclarator?: (node: VariableDeclarator) => void;
    CatchClause?: (node: CatchClause) => void;
}

type NodeHandler<T> = (n: T, push: (n: Node) => void) => void;
type StatementHandler = {
    [K in AllStatementType]?: NodeHandler<StatementTypeMap[K]>;
};
type ExpressionHandler = {
    [K in AllExpressionType]?: NodeHandler<ExpressionTypeMap[K]>;
};
type LiteralHandler = {
    [K in AllLiteralType]?: NodeHandler<LiteralTypeMap[K]>;
};
type NodeHandlers = StatementHandler &
    ExpressionHandler &
    LiteralHandler & {
        VariableDeclarator?: NodeHandler<VariableDeclarator>;
        CatchClause?: NodeHandler<CatchClause>;
    };

type NodeInStack = {
    node: Node;
    /** 为 true 表示进入该节点 */
    enter: boolean;
};

// #endregion

/** 开始处理 AST，并返回新的 AST */
export function handle_ast(ast: Program, visitor: Visitor): Program {
    for (const statement of ast.body) {
        traverse(statement, visitor);
    }

    return ast;
}

/** 遍历结点，以类似 babel visitor exit 模式来处理节点哟。
 *
 * 注意，本实现并不通用，根据需求内部会有对应调整。
 */
function traverse(node?: Node, visitor?: Visitor) {
    if (!node) {
        return;
    }

    /** 为了避免大量循环调用 traverse，使用堆栈存储待处理的节点 */
    const stack: NodeInStack[] = [{ node, enter: true }];

    /** 定义对不同节点的添加 */
    const node_handlers: NodeHandlers = {
        // #region Type Statement

        BlockStatement(n, push) {
            for (const statement of n.stmts) {
                push(statement);
            }
        },
        WithStatement(n, push) {
            push(n.object);
            push(n.body);
        },
        ReturnStatement(n, push) {
            n.argument && push(n.argument);
        },
        LabeledStatement(n, push) {
            push(n.label);
            push(n.body);
        },
        BreakStatement(n, push) {
            n.label && push(n.label);
        },
        ContinueStatement(n, push) {
            n.label && push(n.label);
        },
        IfStatement(n, push) {
            push(n.test);
            push(n.consequent);
            n.alternate && push(n.alternate);
        },
        SwitchStatement(n, push) {
            push(n.discriminant);
            for (const switch_case of n.cases) {
                push(switch_case);
            }
        },
        ThrowStatement(n, push) {
            push(n.argument);
        },
        TryStatement(n, push) {
            push(n.block);
            n.handler && push(n.handler);
            n.finalizer && push(n.finalizer);
        },
        CatchClause(n, push) {
            n.param && push(n.param);
            push(n.body);
        },
        WhileStatement(n, push) {
            push(n.test);
            push(n.body);
        },
        DoWhileStatement(n, push) {
            push(n.body);
            push(n.test);
        },
        ForStatement(n, push) {
            n.init && push(n.init);
            n.test && push(n.test);
            n.update && push(n.update);
            push(n.body);
        },
        ForInStatement(n, push) {
            push(n.left);
            push(n.right);
            push(n.body);
        },
        ForOfStatement(n, push) {
            push(n.left);
            push(n.right);
            push(n.body);
        },
        VariableDeclaration(n, push) {
            for (const declaration of n.declarations) {
                push(declaration);
            }
        },
        ClassDeclaration(n, push) {
            push(n.identifier);
        },
        FunctionDeclaration(n, push) {
            push(n.identifier);
        },
        ExpressionStatement(n, push) {
            push(n.expression);
        },

        // #endregion

        // #region Type Expression

        ThisExpression(n, push) {},
        ArrayExpression(n, push) {
            for (const element of n.elements) {
                element?.expression && push(element.expression);
            }
        },
        ObjectExpression(n, push) {
            for (const property of n.properties) {
                push(property);
            }
        },
        FunctionExpression(n, push) {
            n.identifier && push(n.identifier);
        },
        UnaryExpression(n, push) {
            push(n.argument);
        },
        UpdateExpression(n, push) {
            push(n.argument);
        },
        BinaryExpression(n, push) {
            push(n.left);
            push(n.right);
        },
        AssignmentExpression(n, push) {
            push(n.left);
            push(n.right);
        },
        MemberExpression(n, push) {
            push(n.object);
            push(n.property);
        },
        SuperPropExpression(n, push) {
            push(n.property);
        },
        ConditionalExpression(n, push) {
            push(n.test);
            push(n.consequent);
            push(n.alternate);
        },
        CallExpression(n, push) {
            push(n.callee);
            for (const argument of n.arguments) {
                push(argument.expression);
            }
        },
        NewExpression(n, push) {
            push(n.callee);
            if (n.arguments) {
                for (const argument of n.arguments) {
                    push(argument.expression);
                }
            }
        },
        SequenceExpression(n, push) {
            for (const expression of n.expressions) {
                push(expression);
            }
        },
        Identifier(n, push) {},
        VariableDeclarator(n, push) {
            push(n.id);
            n.init && push(n.init);
        },

        //#endregion

        // #region Type Literal

        StringLiteral(n, push) {},
        BooleanLiteral(n, push) {},
        NullLiteral(n, push) {},
        NumericLiteral(n, push) {},
        BigIntLiteral(n, push) {},
        RegExpLiteral(n, push) {},

        // #endregion

        TemplateLiteral(n, push) {
            for (const expression of n.expressions) {
                push(expression);
            }
            for (const element of n.quasis) {
                push(element);
            }
        },
        TaggedTemplateExpression(n, push) {
            push(n.tag);
            push(n.template);
        },
        ArrowFunctionExpression(n, push) {
            for (const parameter of n.params) {
                push(parameter);
            }
            push(n.body);
        },
        ClassExpression(n, push) {
            n.identifier && push(n.identifier);
            // #cure-todo
            // push(n.body);
            n.superClass && push(n.superClass);
        },
        YieldExpression(n, push) {
            n.argument && push(n.argument);
        },
        MetaProperty(n, push) {},
        AwaitExpression(n, push) {
            push(n.argument);
        },
        ParenthesisExpression(n, push) {
            push(n.expression);
        },
        PrivateName(n, push) {
            push(n.id);
        },
        OptionalChainingExpression(n, push) {
            push(n.base);
        },
        Invalid(n, push) {},
        DebuggerStatement(n, push) {},
        EmptyStatement(n, push) {},
        // 多出来的是 ts、jsx 的语法，不处理
    };

    function push(node: Node) {
        stack.push({ node, enter: true });
    }

    // 处理处理堆栈中的节点
    while (stack.length) {
        const node_in_stack = stack.pop();
        if (!node_in_stack) {
            continue;
        }
        const { node, enter } = node_in_stack;
        const type = node.type as AllNodeType;

        // 进入节点时，将它的子节点添加到堆栈中
        if (enter) {
            // 是一个处理过的函数，那么不再处理它的子节点
            if (
                type === "CallExpression" &&
                is_hooked(node as CallExpression)
            ) {
                continue;
            }

            stack.push({ node, enter: false });
            const node_handler = node_handlers[type];
            if (node_handler) {
                node_handler(node as any, push);
            } else {
                console.warn(`unhandled node type: ${node.type}`);
            }
        }
        // 离开节点时，处理节点
        else {
            const handler = visitor?.[type];
            if (handler) {
                handler(node as any);
            }
        }
    }
}

// #region 创建 Hooker

const HOOK_NAME = "cure_sinker";
const HOOK_IDENT: Identifier = {
    // 逆天大坑！！！
    // @ts-ignore
    ctxt: 0,
    type: "Identifier",
    value: HOOK_NAME,
    optional: false,
    span: {
        start: 0,
        end: 0,
        ctxt: 0,
    },
};

/** 给定一个节点，创建 `cure_sinker(xx)` 这样的包裹形式，即增加 hook 代码 */
export function create_hooker_node(node: Expression) {
    const arg: Argument = {
        expression: node,
    };
    const new_node: CallExpression = {
        // @ts-ignore
        ctxt: 0,
        type: "CallExpression",
        callee: HOOK_IDENT,
        arguments: [arg],
        span: {
            start: 0,
            end: 0,
            ctxt: 0,
        },
    };
    return new_node;
}

// #endregion

// #region 辅助函数

/** 判断一个 ast node 是否可以被包裹成 `hook(x)` 的形式 */
export function is_node_hookable(node: Node) {
    return (
        is_literal(node) ||
        (node.type === "CallExpression" && !is_hooked(node as CallExpression))
    );
}

/** 判断是否为字面量节点 —— 当前只处理字符串 */
function is_literal(node: Node) {
    return node.type === "StringLiteral";
}

/** 判断一个函数是否被 hook 过 */
function is_hooked(node: CallExpression) {
    return node.callee.type === "Identifier" && node.callee.value === HOOK_NAME;
}

// #endregion

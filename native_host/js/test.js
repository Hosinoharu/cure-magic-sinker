// #region 测试普通表达式

const one = 1; const two = 2;
const three = one + two; const four = two * two;

// #endregion

// #region 测试普通函数

function add(x, y) { return x + y; }

const five = add(two, three);

// #endregion

// #region 测试普通对象

const person = {
    name: "hosino",
    age: 18,
    sayHello() {
        return `Hello I'm ${this.name}, age: ${this.age}`;
    },
};

const hello = person.sayHello();
console.log(hello);

// #endregion

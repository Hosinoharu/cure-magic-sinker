/** 读写 indexedDB 的 worker
 * 1. 每收到 100 条数据后写入
 * 2. 每隔 5s 写入一次
 */

export async function worker_func() {
    /** 记录 hook 的值以及生成的堆栈 */
    class ValueDataBase {
        private db_name = "CureMagicSinker";
        private db_version = 1;
        /** 存储堆栈的 store */
        private db_store_name = "cure-sinker-value";

        /** 每拿到一定量的数据再一次性写入数据库 */
        private buffer_size = 100;
        /** 如果缓存数据太多，说明 db 没有打开，应该清除 */
        private buffer_max_size = 1000;
        /** 缓存区。如果数据库没有打开，也会写入到缓存中。
         * 如果写入时发现重复的值，则合并它们
         */
        private buffer: Map<string, OneValueStackInfo> = new Map();
        /** 每隔一定时间写入到数据库 */
        private flush_interval = 5000;
        /** 存储定时器的 id */
        private flush_timer: number | undefined;
        /** 当前正在清空 buffer 哟 */
        private flushing = false;

        private db: IDBDatabase | undefined;

        /** 打开数据库，失败则抛出错误 */
        public async open() {
            const self = this;
            if (self.db) {
                return;
            }

            return new Promise<void>((resolve, reject) => {
                const db_req = indexedDB.open(self.db_name, self.db_version);

                db_req.onerror = (_) => {
                    reject(new Error(`open database [${self.db_name}] error`));
                };

                db_req.onsuccess = (event) => {
                    self.db = self.db || (event.target as any).result;
                    globalThis.postMessage({
                        type: "db-init",
                    } as MsgFromWorker);
                    resolve();
                };

                db_req.onupgradeneeded = (event) => {
                    const db = (event.target as any).result as IDBDatabase;
                    self.db = self.db || db;
                    if (!db.objectStoreNames.contains(self.db_store_name)) {
                        db.createObjectStore(self.db_store_name, {
                            keyPath: "key",
                        });
                    }
                };
            });
        }

        // #region 读写数据

        private merge_stack(from: OneValueStackInfo, to: OneValueStackInfo) {
            if (from.key !== to.key) {
                throw new Error("merge_stack faild! key not match");
            }

            Array.from(from.stack.values()).forEach((curr) => {
                to.stack.add(curr);
            });
        }

        /** 写入多个值的堆栈信息，如果存在则覆盖 */
        private async put_record(values: OneValueStackInfo[]) {
            const self = this;
            return new Promise<void>((resolve, reject) => {
                if (!self.db) {
                    return reject(
                        new Error(
                            `get record faild! database [${self.db_name}] is not open`,
                        ),
                    );
                }

                const tx = self.db.transaction(
                    [self.db_store_name],
                    "readwrite",
                );
                tx.oncomplete = () => resolve();
                tx.onabort = () => reject(new Error("transaction aborted"));
                tx.onerror = (e) => reject((e.target as any).error);

                const store = tx.objectStore(self.db_store_name);
                for (const curr of values) {
                    // 如果已存储值，则更新堆栈，否则直接写入
                    const req = store.get(curr.key);
                    req.onsuccess = (event) => {
                        const old = (event.target as any).result as
                            | OneValueStackInfo
                            | undefined;

                        if (old) {
                            self.merge_stack(old, curr);
                        }

                        store.put(curr);
                    };
                    req.onerror = (e) => reject((e.target as any).error);
                }

                resolve();
            });
        }

        /** 搜索值 */
        public async find(
            value: string | RegExp,
        ): Promise<OneValueStackInfo[]> {
            const self = this;
            return new Promise<OneValueStackInfo[]>((resolve, reject) => {
                if (!self.db) {
                    return reject(
                        new Error(
                            `get record faild! database [${self.db_name}] is not open`,
                        ),
                    );
                }

                const tx = self.db.transaction(
                    [self.db_store_name],
                    "readonly",
                );
                tx.oncomplete = () => resolve([]);
                tx.onabort = () => reject(new Error("transaction aborted"));
                tx.onerror = (e) => reject((e.target as any).error);

                const store = tx.objectStore(self.db_store_name);
                const req = store.getAll();
                req.onsuccess = (event) => {
                    const result = (event.target as any).result as
                        | OneValueStackInfo[]
                        | undefined;
                    if (!result) {
                        return resolve([]);
                    }

                    const is_str = typeof value === "string";
                    const matched = result.filter((curr) => {
                        if (is_str) {
                            return curr.key
                                .toLowerCase()
                                .includes(value.toLowerCase());
                        } else {
                            return (value as RegExp).test(curr.key);
                        }
                    });
                    resolve(matched);
                };
                req.onerror = (e) => reject((e.target as any).error);
            });
        }

        // #endregion

        // #region 读写 buffer

        /** 启动或重置定时器 */
        private reset_flush_timer() {
            if (this.flush_timer) {
                clearTimeout(this.flush_timer);
                this.flush_timer = undefined;
            }
            this.flush_timer = setTimeout(async () => {
                // 必须确保定时刷新能有效运行
                const ok = await this.flush_buffer();
                !ok && this.reset_flush_timer();
            }, this.flush_interval) as any as number;
        }

        /** 批量写入，成功则返回 true */
        private async flush_buffer() {
            let ok = false;
            if (this.flushing || this.buffer.size === 0) {
                return ok;
            }

            this.flushing = true;

            // #cure-todo 此时可以合并 buffer 中相同的值！
            const ready_to_write = Array.from(this.buffer.values());
            this.buffer.clear();
            try {
                await this.put_record(ready_to_write);
                ok = true;
            } catch (e) {
                // #cure-tip 如果报错，那么 buffer 就彻底丢失了
                console.error("flush buffer error:", e);
            }

            this.flushing = false;
            return ok;
        }

        /** 外部调用它来添加数据 */
        public add_to_buffer(data: OneValueStackInfo) {
            // buffer 中已经存在，则合并它们
            const old = this.buffer.get(data.key);
            if (old) {
                this.merge_stack(old, data);
            } else {
                this.buffer.set(data.key, data);
            }

            if (this.buffer_size > this.buffer_max_size) {
                console.warn(
                    "something's wrong! buffer size is bigger than buffer_max_size",
                );
                this.buffer.clear();
                return;
            }

            this.reset_flush_timer();

            if (this.buffer.size >= this.buffer_size) {
                this.flush_buffer();
            }
        }

        // #endregion
    }

    const db_value = new ValueDataBase();
    await db_value.open();

    globalThis.onmessage = async (event: MessageEvent) => {
        const data = event.data as MsgToWorker;
        // console.log("db_worker receive message:", data);
        if (data.type === "add") {
            db_value.add_to_buffer(data.data);
        } else if (data.type === "find") {
            try {
                const result = await db_value.find(data.data);
                const msg: MsgFromWorker = {
                    type: "find-result",
                    data: result,
                };
                globalThis.postMessage(msg);
            } catch (e) {
                console.error("db_value.find error:", e);
            }
        }
    };

    console.log("[CureMagicSinker] worker started");
}

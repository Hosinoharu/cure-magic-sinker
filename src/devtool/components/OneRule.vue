<template>
    <section class="all-rules"
        v-if="all_rules !== undefined && all_rules.length !== 0">
        <section class="one-rule" v-for="(rule, index) in all_rules"
            :key="index">
            <button type="button"
                :class="rule.enable ? 'enable-btn' : 'disable-btn'"
                @click="toggle_one_rule(rule)"></button>
            <section class="input-container">
                <input v-model="rule.rule" type="text" name="rule"
                    @input="is_valid_rule(rule)" placeholder="regex rule"
                    spellcheck="false" class="border-amber-200 border-2" />
                <button class="clear-btn" @click="clear_one_rule(rule)"
                    type="button">
                    ✕
                </button>
                <span class="error-info" v-show="rule.invalid">
                    regex is invalid
                </span>
            </section>
            <button type="button" @click="delete_one_rule(index)"
                class="del-btn"></button>
        </section>
    </section>
    <span v-else class="empty-info">
        NO RULES. 点击上面网站名称添加
    </span>
</template>

<script setup lang="ts">
import { debounce, raw_is_valid_rule } from '../../share';

const { all_rules } = defineProps<{
    all_rules?: OneRule[],
}>();

const emit = defineEmits<{
    save_all_rules: []
}>();


// #region handle rule

function delete_one_rule(index: number) {
    all_rules?.splice(index, 1);
    emit('save_all_rules');
}

function toggle_one_rule(rule: OneRule) {
    rule.enable = !rule.enable;
    emit('save_all_rules');
}

function clear_one_rule(rule: OneRule) {
    rule.rule = "";
    emit('save_all_rules');
}

const is_valid_rule = debounce((rule: OneRule) => {
    rule.rule = rule.rule.trim();
    emit('save_all_rules');
    rule.invalid = !raw_is_valid_rule(rule.rule);
}, 200);

// #endregion

</script>

<style scoped>
.all-rules {
    width: 80%;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    gap: 0.8rem;
    margin-top: 10px;
}

.one-rule {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 10px;
    width: 100%;
}

.enable-btn {
    background-color: var(--cure-kiss);
}

.disable-btn {
    background-color: transparent;
    border: 2px solid var(--cure-kiss);
}

.input-container {
    position: relative;
    display: flex;
    align-items: center;
    flex-grow: 1;
}

.input-container input {
    width: 100%;
}

.clear-btn {
    position: absolute;
    right: 0;
    color: #888;
    font-size: 10px;
}

.clear-btn:hover {
    color: var(--cure-zukyoon);
}

.error-info {
    position: absolute;
    font-size: 0.5rem;
    color: var(--cure-zukyoon);
    left: 10px;
    bottom: -50%;
}

.del-btn {
    background-color: var(--cure-kyun);
}

.empty-info {
    margin-top: 30px;
    font-size: large;
    color: var(--cure-zukyoon);
}
</style>
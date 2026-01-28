<template>
    <button type="button" class="normal-mode" :class="{ 'normal-mode-on': on }"
        @click="emit('click')">
        {{ text }}
    </button>
</template>

<script setup lang="ts">
defineProps<{
    on: boolean;
    text: string;
}>();

const emit = defineEmits<{
    click: [];
}>();
</script>

<style scoped>
button {
    width: fit-content;
    height: 2rem;
    padding: 5px 15px;
    color: var(--font-color);
    border: 1px solid var(--disable-color);
}

button:hover {
    border: 1px solid var(--cure-kiss);
}

.normal-mode {
    border: 1px solid var(--disable-color);
    color: var(--disable-color);
    transition: none;
}

.normal-mode-on {
    border-color: var(--cure-kiss);
    color: var(--cure-kiss);
}
</style>

import { defineStore } from 'pinia';
import { ref, watch } from 'vue';

export const useUserStore = defineStore('user', () => {
  const userId = ref(localStorage.getItem('userId') || '');
  const apiKey = ref(localStorage.getItem('apiKey') || '');

  watch(userId, (newUserId) => {
    localStorage.setItem('userId', newUserId);
  });

  watch(apiKey, (newApiKey) => {
    localStorage.setItem('apiKey', newApiKey);
  });

  return {
    userId,
    apiKey,
  };
});

<script lang="ts">
  import SenderPanel from "$lib/components/sender/SenderPanel.svelte";
  import ReceiverPanel from "$lib/components/receiver/ReceiverPanel.svelte";

  let { data, form } = $props();
</script>

<svelte:head>
  <title>ArticleSwap | Kelompok 2</title>
</svelte:head>

<main class="dashboard">
  <header class="header">
    <div class="logo">
      <h1>ArticleSwap <span>Dashboard</span></h1>
    </div>
    <div class="status-indicator">Kelompok 2</div>
  </header>

  <div class="container">
    <SenderPanel
      initialRecent={data.recent}
      initialRecentTotal={data.recentTotal}
      initialRecentError={data.recentError}
      submitResult={form?.submitResult}
    />
    <ReceiverPanel />
  </div>
</main>

<style>
  @import "./page.css";
</style>

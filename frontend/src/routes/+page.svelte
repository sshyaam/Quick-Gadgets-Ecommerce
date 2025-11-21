<script>
	import { goto } from '$app/navigation';
</script>

<div class="text-center py-16">
	<h1 class="text-4xl font-bold text-gray-900 mb-4">Welcome to Quick Gadgets</h1>
	<p class="text-xl text-gray-600 mb-8">Your one-stop shop for electronic gadgets</p>
	<div class="space-x-4">
		<button
			on:click={() => goto('/catalog')}
			class="bg-blue-500 hover:bg-blue-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
		>
			Browse Catalog
		</button>
	</div>
</div>


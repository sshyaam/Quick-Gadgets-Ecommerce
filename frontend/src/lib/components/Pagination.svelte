<script>
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';

	export let pagination = {};
	export let baseUrl = '';
	export let preserveParams = true; // Preserve existing URL params
	export let pageParam = 'page'; // Custom page parameter name (for admin tabs)

	function goToPage(pageNum) {
		if (pageNum < 1 || pageNum > pagination.totalPages) return;
		
		const params = new URLSearchParams();
		
		if (preserveParams) {
			// Preserve existing query params
			$page.url.searchParams.forEach((value, key) => {
				if (key !== pageParam && key !== 'stockPage') {
					params.set(key, value);
				}
			});
		}
		
		params.set(pageParam, String(pageNum));
		
		const queryString = params.toString();
		const url = queryString ? `${baseUrl}?${queryString}` : `${baseUrl}?${pageParam}=${pageNum}`;
		goto(url, { invalidateAll: true, noScroll: false });
	}

	function getPageNumbers() {
		const current = pagination.page || 1;
		const total = pagination.totalPages || 1;
		const pages = [];
		
		// Always show first page
		if (total > 0) {
			pages.push(1);
		}
		
		// Calculate range around current page
		const start = Math.max(2, current - 1);
		const end = Math.min(total - 1, current + 1);
		
		// Add ellipsis if needed
		if (start > 2) {
			pages.push('...');
		}
		
		// Add pages in range
		for (let i = start; i <= end; i++) {
			if (i !== 1 && i !== total) {
				pages.push(i);
			}
		}
		
		// Add ellipsis if needed
		if (end < total - 1) {
			pages.push('...');
		}
		
		// Always show last page (if more than 1 page)
		if (total > 1) {
			pages.push(total);
		}
		
		return pages;
	}
</script>

{#if pagination.totalPages > 1}
	<div class="flex items-center justify-center gap-2 mt-6">
		<!-- Previous Button -->
		<button
			on:click={() => goToPage((pagination.page || 1) - 1)}
			disabled={!pagination.hasPrev}
			class="px-4 py-2 border rounded-lg {pagination.hasPrev ? 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}"
		>
			Previous
		</button>

		<!-- Page Numbers -->
		<div class="flex items-center gap-1">
			{#each getPageNumbers() as pageNum}
				{#if pageNum === '...'}
					<span class="px-2 text-gray-500">...</span>
				{:else}
					<button
						on:click={() => goToPage(pageNum)}
						class="px-4 py-2 border rounded-lg {pageNum === pagination.page ? 'bg-blue-500 text-white border-blue-500' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}"
					>
						{pageNum}
					</button>
				{/if}
			{/each}
		</div>

		<!-- Next Button -->
		<button
			on:click={() => goToPage((pagination.page || 1) + 1)}
			disabled={!pagination.hasNext}
			class="px-4 py-2 border rounded-lg {pagination.hasNext ? 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300' : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'}"
		>
			Next
		</button>
	</div>

	<!-- Page Info -->
	<div class="text-center text-sm text-gray-600 mt-2">
		Showing {((pagination.page || 1) - 1) * (pagination.limit || 10) + 1} to {Math.min((pagination.page || 1) * (pagination.limit || 10), pagination.total || 0)} of {pagination.total || 0} results
	</div>
{/if}


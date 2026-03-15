// SPDX-License-Identifier: BUSL-1.1

package com.finance.android.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Fastfood
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.LocalGasStation
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/**
 * Represents a selectable financial category with display metadata.
 */
data class CategoryItem(
    val id: String,
    val name: String,
    val icon: ImageVector,
    val color: Color,
)

/**
 * Bottom sheet presenting a searchable grid of financial categories.
 *
 * Provides a search field at the top that filters categories by name
 * and a grid layout showing each category's icon, name, and selected state.
 *
 * @param categories The full list of categories to display.
 * @param selectedCategoryId The currently selected category ID, or null.
 * @param onCategorySelected Callback invoked when the user taps a category.
 * @param onDismiss Callback invoked when the bottom sheet is dismissed.
 * @param sheetState Optional [SheetState] for controlling the bottom sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryPicker(
    categories: List<CategoryItem>,
    selectedCategoryId: String?,
    onCategorySelected: (CategoryItem) -> Unit,
    onDismiss: () -> Unit,
    sheetState: SheetState = rememberModalBottomSheetState(),
) {
    var searchQuery by remember { mutableStateOf("") }

    val filteredCategories = remember(categories, searchQuery) {
        if (searchQuery.isBlank()) {
            categories
        } else {
            categories.filter {
                it.name.contains(searchQuery, ignoreCase = true)
            }
        }
    }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        modifier = Modifier.semantics {
            contentDescription = "Category picker bottom sheet"
        },
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 16.dp)
                .padding(bottom = 24.dp),
        ) {
            Text(
                text = "Select Category",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier
                    .padding(bottom = 12.dp)
                    .semantics { contentDescription = "Select Category heading" },
            )

            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 12.dp)
                    .semantics { contentDescription = "Search categories" },
                placeholder = { Text("Search categories\u2026") },
                leadingIcon = {
                    Icon(
                        Icons.Default.Search,
                        contentDescription = "Search icon",
                    )
                },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(onClick = { searchQuery = "" }) {
                            Icon(
                                Icons.Default.Close,
                                contentDescription = "Clear search",
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
            )

            if (filteredCategories.isEmpty()) {
                Text(
                    text = "No categories found",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 32.dp)
                        .semantics { contentDescription = "No categories found" },
                    textAlign = TextAlign.Center,
                )
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    contentPadding = PaddingValues(vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    items(
                        items = filteredCategories,
                        key = { it.id },
                    ) { category ->
                        val isSelected = category.id == selectedCategoryId
                        CategoryGridCell(
                            category = category,
                            isSelected = isSelected,
                            onClick = { onCategorySelected(category) },
                        )
                    }
                }
            }
        }
    }
}

/**
 * Individual grid cell showing a category icon, name, and optional checkmark overlay.
 */
@Composable
private fun CategoryGridCell(
    category: CategoryItem,
    isSelected: Boolean,
    onClick: () -> Unit,
) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(4.dp)
            .clearAndSetSemantics {
                contentDescription =
                    "${category.name} category${if (isSelected) ", selected" else ""}"
            },
    ) {
        Box(contentAlignment = Alignment.Center) {
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .aspectRatio(1f)
                    .clip(CircleShape)
                    .background(category.color.copy(alpha = 0.15f)),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = category.icon,
                    contentDescription = null, // handled by parent semantics
                    tint = category.color,
                    modifier = Modifier.size(24.dp),
                )
            }

            androidx.compose.animation.AnimatedVisibility(
                visible = isSelected,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                Box(
                    modifier = Modifier
                        .size(48.dp)
                        .clip(CircleShape)
                        .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.85f)),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = Icons.Default.Check,
                        contentDescription = null, // handled by parent semantics
                        tint = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.size(20.dp),
                    )
                }
            }
        }

        Text(
            text = category.name,
            style = MaterialTheme.typography.labelSmall,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(top = 4.dp),
        )
    }
}

// -- Previews -----------------------------------------------------------------

private val sampleCategories = listOf(
    CategoryItem("1", "Food", Icons.Default.Fastfood, Color(0xFF4CAF50)),
    CategoryItem("2", "Housing", Icons.Default.Home, Color(0xFF2196F3)),
    CategoryItem("3", "Transport", Icons.Default.LocalGasStation, Color(0xFFFF9800)),
    CategoryItem("4", "Shopping", Icons.Default.ShoppingCart, Color(0xFFE91E63)),
    CategoryItem("5", "Work", Icons.Default.Work, Color(0xFF9C27B0)),
)

@OptIn(ExperimentalMaterial3Api::class)
@Preview(showBackground = true, name = "CategoryPicker - with selection")
@Composable
private fun CategoryPickerPreview() {
    MaterialTheme {
        CategoryPicker(
            categories = sampleCategories,
            selectedCategoryId = "2",
            onCategorySelected = {},
            onDismiss = {},
        )
    }
}

@Preview(showBackground = true, name = "CategoryGridCell - unselected")
@Composable
private fun CategoryGridCellUnselectedPreview() {
    MaterialTheme {
        CategoryGridCell(
            category = sampleCategories.first(),
            isSelected = false,
            onClick = {},
        )
    }
}

@Preview(showBackground = true, name = "CategoryGridCell - selected")
@Composable
private fun CategoryGridCellSelectedPreview() {
    MaterialTheme {
        CategoryGridCell(
            category = sampleCategories.first(),
            isSelected = true,
            onClick = {},
        )
    }
}

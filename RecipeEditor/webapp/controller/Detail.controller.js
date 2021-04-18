sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"../model/formatter",
	"sap/m/library"
], function (BaseController, JSONModel, Device, MessageBox, MessageToast, Filter, FilterOperator, Sorter, formatter, mobileLibrary) {
	"use strict";
	// shortcut for sap.m.URLHelper
	var URLHelper = mobileLibrary.URLHelper;
	return BaseController.extend("recipe.RecipeEditor.controller.Detail", {
		formatter: formatter,
		/* =========================================================== */
		/* lifecycle methods                                           */
		/* =========================================================== */
		onInit: function () {
			// Model used to manipulate control states. The chosen values make sure,
			// detail page is busy indication immediately so there is no break in
			// between the busy indication for loading the view's meta data
			var oViewModel = new JSONModel({
				busy: false,
				delay: 0,
				mode: "None",
				recipeID: "",
				productivity: 0.00,
				lineItemListTitle: this.getResourceBundle().getText("detailLineItemTableHeading"),
				totalRequiredSkills: 0,
				skillSelected: false,
				resultsItemListTitle: "",
				totalResults: 0
			});
			this.getRouter().getRoute("object").attachPatternMatched(this._onObjectMatched, this);
			this.setModel(oViewModel, "detailView");
			this.getOwnerComponent().getModel().metadataLoaded().then(this._onMetadataLoaded.bind(this));
		},
		/* =========================================================== */
		/* event handlers                                              */
		/* =========================================================== */
		/**
		 * Event handler when the share by E-Mail button has been clicked
		 * @public
		 */
		onSendEmailPress: function () {
			var oViewModel = this.getModel("detailView");
			URLHelper.triggerEmail(null, oViewModel.getProperty("/shareSendEmailSubject"), oViewModel.getProperty("/shareSendEmailMessage"));
		},
		/////////////////////////  RECIPE FUNCTIONS ///////////////////////////////////////////////

		onEditRecipe: function () {
			var sObjectId = this.getModel("appView").getProperty("/selectedRecipeID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getRouter().getTargets().display("create", {
				mode: "Edit",
				objectId: sObjectId
			});
		},

		onAddRecipe: function () {
			var sObjectId = this.getModel("appView").getProperty("/selectedRecipeID");
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/mode", "Create");
			this.getRouter().getTargets().display("create", {
				mode: "Create",
				objectId: sObjectId
			});
		},

		onCopyRecipe: function () {
			var sObjectId = this.getModel("appView").getProperty("/selectedRecipeID");
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/mode", "Copy");
			this.getRouter().getTargets().display("create", {
				mode: "Copy",
				objectId: sObjectId
			});
		},

		onDeleteRecipe: function () {
			var oModel = this.getModel(),
				sObjectId = this.getModel("appView").getProperty("/selectedRecipeID"),
				sRecipePath = "/" + oModel.createKey("Recipes", {
					ID: sObjectId
				}),
				that = this,
				sConfirmTitle = this.getResourceBundle().getText("recipeDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("recipeDeleteConfirmationText"),
				sSuccessMessage = this.getResourceBundle().getText("sSuccessMessage"),
				fnAfterDeleted = function () {
					MessageToast.show(sSuccessMessage);
					that.getModel("detailView").setProperty("/busy", false);
					var oNextItemToSelect = that.getOwnerComponent().oListSelector.findNextItem(sRecipePath);
					if (oNextItemToSelect) {
						that.getModel("appView").setProperty("/itemToSelect", oNextItemToSelect.getBindingContext().getPath());
					} else {
						that.getModel("appView").setProperty("/itemToSelect", null);
					}
					that.getModel("appView").setProperty("/mode", "None");
					that.onCloseDetailPress();
				};

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							that.getModel("detailView").setProperty("/busy", true);
							oModel.remove(sRecipePath, {
								success: fnAfterDeleted()
							});
						}
					}
				}
			);
		},

		///////////////////////////////// SKILL OPERATIONS /////////////////////////

		onEditSkill: function () {
			var bReplace = !Device.system.phone;
			// set the layout property of FCL control to show two columns
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getRouter().navTo("skills", bReplace);
		},

		onAddSkill: function (oEvent) {
			var oModel = this.getModel(),
				oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				sDraggedItemID = oDraggedItemContext.getProperty("ID"),
				aItems = this.byId("lineItemsList").getItems();

			if (!oDraggedItemContext) {
				return;
			}

			oModel.createEntry("SkillsForRecipe", {
				properties: {
					skill_ID: sDraggedItemID,
					recipe_ID: this.getModel("appView").getProperty("/selectedRecipeID"),
					rank: aItems.length
				}
			});
			oModel.submitChanges();
		},

		onMoveSkill: function (oEvent) {
			var oModel = this.getModel(),
				oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				sDraggedItemID = oDraggedItemContext.getProperty("ID"),
				oDragSession = oEvent.getParameter("dragSession"),
				oDraggedRowContext = oDragSession.getComplexData("draggedRowContext"),
				sDropPosition = oEvent.getParameter("dropPosition"),
				oDroppedRow = oEvent.getParameter("droppedControl"),
				oDroppedRowContext = oDroppedRow.getBindingContext(),
				sDroppedRowID = oDroppedRowContext.getProperty("ID"),
				iDroppedRowRank = oDroppedRowContext.getProperty("rank"),
				iDraggedRowRank = oDraggedItemContext.getProperty("rank"),
				aItems = this.byId("lineItemsList").getItems(),
				iNewRank,
				iCounter,
				iStartChangeIndex = (iDroppedRowRank < iDraggedRowRank) ? iDroppedRowRank : iDraggedRowRank,
				iEndChangeIndex = (iDroppedRowRank > iDraggedRowRank) ? iDroppedRowRank : iDraggedRowRank,
				resetRanks = function () {
					for (var j = 0; j < aItems.length; j++) {
						oModel.setProperty("rank", j, aItems[j].getBindingContext());
					}
					oModel.submitChanges();
				};

			if (!oDraggedItemContext) {
				return;
			}

			if (iDraggedRowRank < iDroppedRowRank) { // moving down
				iNewRank = (sDropPosition === "Before") ? iDroppedRowRank - 1 : iDroppedRowRank;
				iCounter = 0;
			} else { // moving up
				iNewRank = (sDropPosition === "Before") ? iDroppedRowRank : iDroppedRowRank + 1;
				iCounter = 1;
			}
			iCounter += iStartChangeIndex;
			for (var i = iStartChangeIndex; i < iEndChangeIndex + 1; i++) { // new ranks for the old items
				// skip the dragged item and don't change to the new rank
				if (i !== iDraggedRowRank && iCounter !== iDroppedRowRank) {
					oModel.setProperty("rank", iCounter, aItems[i].getBindingContext());
					iCounter += 1; // use counter because the dragged item is skipped
				}
			}
			// new rank for the dragged  item; 
			// last operation because setProperty also changes aItems and the loop doesn't work!!!
			oModel.setProperty("rank", iNewRank, oDraggedRowContext);

			oModel.submitChanges({
				success: function (oData) {
					resetRanks(); // just for safety; no changes should be required
				}
			});
		},

		onRemoveSkill: function (oEvent) {
			var aSelectedItems = this.byId("lineItemsList").getSelectedItems(),
				oModel = this.getModel(),
				sConfirmText = this.getResourceBundle().getText("confirmRemoveRequiredSkill"),
				sConfirmTitle = this.getResourceBundle().getText("confirmRemoveSkillTitle");

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							for (var i = 0; i < aSelectedItems.length; i++) {
								oModel.remove(aSelectedItems[i].getBindingContext().getPath());
							}
						}
					}
				}
			);
		},

		onDragStart: function (oEvent) {
			var oDraggedRow = oEvent.getParameter("target");
			var oDragSession = oEvent.getParameter("dragSession");

			oDragSession.setComplexData("draggedRowContext", oDraggedRow.getBindingContext());
		},

		onSkillSelectionChange: function (oEvent) {
			this.getModel("detailView").setProperty("/skillSelected", this.byId("lineItemsList").getSelectedItems().length > 0);
		},

		/**
		 * Updates the item count within the line item table's header
		 * @param {object} oEvent an event containing the total number of items in the list
		 * @private
		 */
		onListUpdateFinished: function (oEvent) {
			var sTitle, iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView"),
				oList = this.byId("lineItemsList");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailLineItemTableHeading");
				}
				oViewModel.setProperty("/lineItemListTitle", sTitle);
				oViewModel.setProperty("/totalRequiredSkills", iTotalItems);
			}
		},

		//////////////////////////////// RECIPE RESULTS ///////////////////////////////////

		onResultListSelectionChange: function () {
			this.byId("resultsDeleteButton").setEnabled(this.byId("resultItemsList").getSelectedItems().length > 0);
		},

		onDeleteResults: function () {
			var oModel = this.getModel(),
				aSelectedResults = this.byId("resultItemsList").getSelectedItems();

			for (var i = 0; i < aSelectedResults.length; i++) {
				oModel.remove(aSelectedResults[i].getBindingContext().getPath());
			}
			this.byId("resultsDeleteButton").setEnabled(false);
		},

		onResultListUpdateFinished: function (oEvent) {
			var sTitle, iTotalItems = oEvent.getParameter("total"),
				oViewModel = this.getModel("detailView"),
				oList = this.byId("resultItemsList");

			// only update the counter if the length is final
			if (oList.getBinding("items").isLengthFinal()) {
				if (iTotalItems) {
					sTitle = this.getResourceBundle().getText("detailResultsTableHeadingCount", [iTotalItems]);
				} else {
					//Display 'Line Items' instead of 'Line items (0)'
					sTitle = this.getResourceBundle().getText("detailResultsTableHeading");
				}
				oViewModel.setProperty("/resultsItemListTitle", sTitle);
				oViewModel.setProperty("/totalResults", iTotalItems);
			}
		},

		onNavBack: function () {
			var sPreviousHash = History.getInstance().getPreviousHash();

			if (sPreviousHash !== undefined) {
				history.go(-1);
			} else {
				this.getRouter().navTo("master", {}, true);
			}
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */
		/**
		 * Binds the view to the object path and expands the aggregated line items.
		 * @function
		 * @param {sap.ui.base.Event} oEvent pattern match event in route 'object'
		 * @private
		 */
		_onObjectMatched: function (oEvent) {
			var sObjectId = oEvent.getParameter("arguments").objectId,
				oModel = this.getModel(),
				sObjectPath = "/" + oModel.createKey("Recipes", {
					ID: sObjectId
				});

			this.getModel("detailView").setProperty("/recipeID", sObjectId);
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/selectedRecipeID", sObjectId);
			this.getModel("appView").setProperty("/itemToSelect", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},
		/**
		 * Binds the view to the object path. Makes sure that detail view displays
		 * a busy indicator while data for the corresponding element binding is loaded.
		 * @function
		 * @param {string} sObjectPath path to the object to be bound to the view.
		 * @private
		 */
		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("detailView"),
				oRecipe, mProductivity;
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			this.getView().bindElement({
				path: sObjectPath,
				events: {
					change: this._onBindingChange.bind(this),
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
						oRecipe = oModel.getObject(sObjectPath);
						mProductivity = oRecipe.productivity;
						oViewModel.setProperty("/productivity", mProductivity);
					}
				}
			});
		},

		_onBindingChange: function () {
			var oView = this.getView(),
				oElementBinding = oView.getElementBinding();
			// No data for the binding
			if (!oElementBinding.getBoundContext()) {
				this.getRouter().getTargets().display("detailObjectNotFound");
				// if object could not be found, the selection in the master list
				// does not make sense anymore.
				this.getOwnerComponent().oListSelector.clearMasterListSelection();
				return;
			}
			var sPath = oElementBinding.getPath(),
				oResourceBundle = this.getResourceBundle(),
				oObject = oView.getModel().getObject(sPath),
				sObjectId = oObject.ID,
				sDisciplineId = oObject.discipline_ID,
				sObjectName = oObject.shortText,
				oViewModel = this.getModel("detailView"),
				mProductivity = oObject.productivity;
			this.getOwnerComponent().oListSelector.selectAListItem(sPath);
			oViewModel.setProperty("/recipeID", sObjectId);
			oViewModel.setProperty("/productivity", mProductivity);
			this.getModel("appView").setProperty("/selectedRecipeID", sObjectId);
			this.getModel("appView").setProperty("/disciplineID", sDisciplineId);
			this.getModel("appView").setProperty("/itemToSelect", sPath);
			oViewModel.setProperty("/shareSendEmailSubject", oResourceBundle.getText("shareSendEmailObjectSubject", [sObjectId]));
			oViewModel.setProperty("/shareSendEmailMessage", oResourceBundle.getText("shareSendEmailObjectMessage", [
				sObjectName,
				sObjectId,
				location.href
			]));
		},

		_onMetadataLoaded: function () {
			// Store original busy indicator delay for the detail view
			var iOriginalViewBusyDelay = this.getView().getBusyIndicatorDelay(),
				oViewModel = this.getModel("detailView"),
				oLineItemTable = this.byId("lineItemsList"),
				iOriginalLineItemTableBusyDelay = oLineItemTable.getBusyIndicatorDelay();
			// Make sure busy indicator is displayed immediately when
			// detail view is displayed for the first time
			oViewModel.setProperty("/delay", 0);
			oViewModel.setProperty("/lineItemTableDelay", 0);
			oLineItemTable.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for line item table
				oViewModel.setProperty("/lineItemTableDelay", iOriginalLineItemTableBusyDelay);
			});
			// Binding the view will set it to not busy - so the view is always busy if it is not bound
			oViewModel.setProperty("/busy", true);
			// Restore original busy indicator delay for the detail view
			oViewModel.setProperty("/delay", iOriginalViewBusyDelay);
		},
		/**
		 * Set the full screen mode to false and navigate to master page
		 */
		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getModel("appView").setProperty("/mode", "None");
			// No item should be selected on master after detail page is closed
			this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("master");
		},
		/**
		 * Toggle between full and non full screen mode.
		 */
		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/midColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "MidColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});
});
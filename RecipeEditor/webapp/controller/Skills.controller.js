sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/m/MessageBox",
	"sap/m/MessageToast",
	"sap/ui/model/Filter",
	"sap/m/GroupHeaderListItem",
	"../model/formatter"
], function (BaseController, JSONModel, MessageBox, MessageToast, Filter, GroupHeaderListItem, formatter) {
	"use strict";

	return BaseController.extend("recipe.RecipeEditor.controller.Skills", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf recipe.RecipeEditor.view.Skills
		 */

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
					lineItemTableDelay: 0,
					skillID: "",
					selected: false,
					multiSelect: false,
					countSkills: 0,
					skillListTitle: this.getResourceBundle().getText("skillLineItemTableHeading")
				}),
				oList = this.byId("skillItemsList"),
				iOriginalBusyDelay = oList.getBusyIndicatorDelay();

			this.setModel(oViewModel, "skillModel");

			this.getRouter().getRoute("skills").attachPatternMatched(this._onObjectMatched, this);
			oList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});
		},

		_onObjectMatched: function () {
			this.getModel().metadataLoaded().then(function () {
				if (this.byId("filterButton").getPressed()) {
					var aFilters = [new Filter({
						path: "profession/discipline_ID",
						operator: sap.ui.model.FilterOperator.EQ,
						value1: this.getModel("appView").getProperty("/disciplineID")
					})];
					this.byId("skillItemsList").getBinding("items").filter(aFilters, "Application");
				}
			}.bind(this));
		},

		onSelectionChange: function (oEvent) {
			var aSelectedSkills = this.byId("skillItemsList").getSelectedItems(),
				oViewModel = this.getModel("skillModel");
			if (aSelectedSkills && aSelectedSkills.length > 0) {
				oViewModel.setProperty("/selected", true);
				if (aSelectedSkills.length > 1) {
					oViewModel.setProperty("/multiSelect", true);
				}
			} else {
				oViewModel.setProperty("/selected", false);
				oViewModel.setProperty("/multiSelect", false);
			}
		},

		onFilterSkill: function (oEvent) {
			var aFilters = [];
			if (oEvent.getParameters().pressed) {
				aFilters = [new Filter({
					path: "profession/discipline_ID",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: this.getModel("appView").getProperty("/disciplineID")
				})];
			} else {
				aFilters = [];
			}
			this.byId("skillItemsList").getBinding("items").filter(aFilters, "Application");
		},

		onAddSkill: function (oEvent) {
			var sPressedItemID,
				oPressedItemContext,
				oModel = this.getModel(),
				oContext,
				aSelectedSkills = this.byId("skillItemsList").getSelectedItems();
			if (!aSelectedSkills || aSelectedSkills.length === 0) {
				return;
			}
			for (var i = 0; i < aSelectedSkills.length; i++) {
				oPressedItemContext = aSelectedSkills[i].getBindingContext();
				sPressedItemID = oPressedItemContext.getProperty("ID");
				oContext = oModel.createEntry("SkillsForRecipe", {
					properties: {
						skill_ID: sPressedItemID,
						recipe_ID: this.getModel("appView").getProperty("/selectedRecipeID"),
						rank: this.getModel("appView").getProperty("/totalRequiredSkills") + 1
					}
				});
			}
			this.getView().setBindingContext(oContext);
			oModel.submitChanges({
				success: MessageToast.show(this.getResourceBundle().getText("successAddSkill"))
			});
		},

		onRemoveSkill: function (oEvent) {
			var oDraggedItem = oEvent.getParameter("draggedControl"),
				oDraggedItemContext = oDraggedItem.getBindingContext(),
				oDraggedItemID = oDraggedItemContext.getProperty("ID");
			if (!oDraggedItemContext) {
				return;
			}

			var oModel = this.getModel(),
				sPath = "/" + oModel.createKey("SkillsForRecipe", {
					ID: oDraggedItemID
				});
			oModel.remove(sPath);
			//oModel.submitChanges();
		},

		onEditSkill: function (oEvent) {
			var sPressedItemID, oPressedItem, oPressedItemContext;
			if (oEvent.getId() === "detailPress") {
				oPressedItem = this.byId(oEvent.getParameters().id);
				oPressedItemContext = oPressedItem.getBindingContext();
			} else { // edit button pressed
				oPressedItemContext = this.byId("skillItemsList").getSelectedItem().getBindingContext();
			}
			if (!oPressedItemContext) {
				return;
			}
			sPressedItemID = oPressedItemContext.getProperty("ID");
			this.getModel("appView").setProperty("/mode", "Edit");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/selectedSkillID", sPressedItemID);
			this.getRouter().getTargets().display("CreateSkill", {
				mode: "Edit",
				objectId: sPressedItemID
			});
		},

		onCopySkill: function (oEvent) {
			var oPressedItemContext = this.byId("skillItemsList").getSelectedItem().getBindingContext();
			if (!oPressedItemContext) {
				return;
			}
			var sPressedItemID = oPressedItemContext.getProperty("ID");
			this.getModel("appView").setProperty("/mode", "Copy");
			this.getModel("appView").setProperty("/layout", "ThreeColumnsEndExpanded");
			this.getModel("appView").setProperty("/selectedSkillID", sPressedItemID);
			this.getRouter().getTargets().display("CreateSkill", {
				mode: "Copy",
				objectId: sPressedItemID
			});
		},

		onDeleteSkill: function (oEvent) {
			var aSelectedItems = this.byId("skillItemsList").getSelectedItems();
			if (!aSelectedItems || aSelectedItems.length === 0) {
				return;
			}
			var sPressedItemID,
				oModel = this.getModel(),
				sPath,
				sConfirmText,
				oComponent = this.getOwnerComponent(),
				that = this;
			if (aSelectedItems === 1) {
				sConfirmText = this.getResourceBundle().getText("confirmSkillDeleteMessage");
			} else {
				sConfirmText = aSelectedItems.length + " " + this.getResourceBundle().getText("confirmSkillsDeleteMessage");
			}
			MessageBox.confirm(
				sConfirmText, {
					styleClass: oComponent.getContentDensityClass(),
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (oAction) {
						if (oAction === sap.m.MessageBox.Action.OK) {
							that.getModel("appView").setProperty("/addEnabled", true);
							that.getModel("skillModel").setProperty("/selected", false);
							that.getModel("skillModel").setProperty("/multiSelect", false);
							for (var i = 0; i < aSelectedItems.length; i++) {
								sPressedItemID = aSelectedItems[i].getBindingContext().getProperty("ID");
								sPath = "/" + oModel.createKey("Skills", {
									ID: sPressedItemID
								});
								oModel.remove(sPath);
							}
							oModel.submitChanges();
						}
					}
				}
			);
		},

		/* =========================================================== */
		/* begin: internal methods                                     */
		/* =========================================================== */

		onSkillListUpdateFinished: function (oEvent) {
			this._updateSkillListItemCount(oEvent.getParameter("total"));
		},

		_updateSkillListItemCount: function (iTotalItems) {
			var sTitle,
				oViewModel = this.getModel("skillModel");
			// only update the counter if the length is final
			if (this.byId("skillItemsList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("skillLineItemTableHeading", [iTotalItems]);
				oViewModel.setProperty("/skillListTitle", sTitle);
				oViewModel.setProperty("/countSkills", iTotalItems);
			}
		},

		getDiscipline: function (oContext) {
			var oDiscipline = oContext.getProperty("profession/discipline"),
				oGroup,
				sNoDiscipline = this.getResourceBundle().getText("noDisciplineAssigned");

			if (oDiscipline) {
				oGroup = {
					key: oDiscipline.code,
					description: oDiscipline.description
				};
			} else {
				oGroup = {
					key: sNoDiscipline
				};
			}
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText = (oGroup.description) ? oGroup.key + " " + oGroup.description : oGroup.key;
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		},

		onCloseDetailPress: function () {
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", false);
			// No item should be selected on master after detail page is closed
			//this.getOwnerComponent().oListSelector.clearMasterListSelection();
			this.getRouter().navTo("object", {
				objectId: this.getModel("appView").getProperty("/selectedRecipeID")
			});
		},

		toggleFullScreen: function () {
			var bFullScreen = this.getModel("appView").getProperty("/actionButtonsInfo/endColumn/fullScreen");
			this.getModel("appView").setProperty("/actionButtonsInfo/endColumn/fullScreen", !bFullScreen);
			if (!bFullScreen) {
				// store current layout and go full screen
				this.getModel("appView").setProperty("/previousLayout", this.getModel("appView").getProperty("/layout"));
				this.getModel("appView").setProperty("/layout", "EndColumnFullScreen");
			} else {
				// reset to previous layout
				this.getModel("appView").setProperty("/layout", this.getModel("appView").getProperty("/previousLayout"));
			}
		}

	});

});
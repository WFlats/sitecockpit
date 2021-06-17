sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/Device",
	"sap/ui/model/Filter",
	"sap/ui/model/FilterOperator",
	"sap/ui/model/Sorter",
	"sap/m/GroupHeaderListItem",
	"sap/ui/core/Fragment",
	"sap/m/Dialog",
	"sap/m/MessageToast",
	"sap/m/MessageBox",
	"../model/formatter",
	"sap/m/library",
	"sap/base/Log"
], function (BaseController, JSONModel, Device, Filter, FilterOperator, Sorter, GroupHeaderListItem, Fragment, Dialog, MessageToast,
	MessageBox, formatter, mobileLibrary, Log) {
	"use strict";

	return BaseController.extend("cockpit.Cockpit.controller.Snapshots", {

		/**
		 * Called when a controller is instantiated and its View controls (if available) are already created.
		 * Can be used to modify the View before it is displayed, to bind event handlers and do other one-time initialization.
		 * @memberOf cockpit.Cockpit.view.Recipes
		 */
		onInit: function () {
			var oPlanVersionList = this.byId("planVersionsList"),
				iOriginalBusyDelay = oPlanVersionList.getBusyIndicatorDelay(),
				oViewModel = this._createViewModel();

			this.setModel(oViewModel, "planVersionView");
			oPlanVersionList.attachEventOnce("updateFinished", function () {
				// Restore original busy indicator delay for the list
				oViewModel.setProperty("/delay", iOriginalBusyDelay);
			});
			this._oPlanVersionList = oPlanVersionList;
			this._oPlanVersionListFilterState = {
				aFilter: [],
				aSearch: []
			};
			this.getRouter().getRoute("Snapshots").attachPatternMatched(this._onObjectMatched, this);
		},

		_onObjectMatched: function (oEvent) {
			var sProjectID = oEvent.getParameter("arguments").projectID;

			this.getModel().metadataLoaded().then(function () {
				var sProjectPath = "/" + this.getModel().createKey("Projects", {
					ID: sProjectID
				});
				this._bindView(sProjectPath);
				// only display a planversion when snapshots are complete
				this.byId("planVersionsList").getBinding("items").filter(new Filter("snapshotsComplete", FilterOperator.EQ, true));
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oViewModel = this.getModel("planVersionView");

			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);

			this.getView().bindElement({
				path: sObjectPath,
				events: {
					dataRequested: function () {
						oViewModel.setProperty("/busy", true);
					},
					dataReceived: function () {
						oViewModel.setProperty("/busy", false);
					}
				}
			});
		},

		onPlanVersionsListUpdateFinished: function (oEvent) {
			this._updatePlanVersionListItemCount(oEvent.getParameter("total"));
		},

		_updatePlanVersionListItemCount: function (iTotalItems) {
			var sTitle;
			// only update the counter if the length is final
			if (this.byId("planVersionsList").getBinding("items").isLengthFinal()) {
				sTitle = this.getResourceBundle().getText("planVersionsListTitle", [iTotalItems]);
				this.getModel("planVersionView").setProperty("/planVersionsListTitle", sTitle);
			}
		},

		onPlanVersionSelectionChange: function (oEvent) {
			var oViewModel = this.getModel("planVersionView"),
				mSelectedItems = this.byId("planVersionsList").getSelectedItems().length;
			if (mSelectedItems === 1) {
				oViewModel.setProperty("/selected", true);
				oViewModel.setProperty("/oneSelected", true);
			} else if (mSelectedItems === 0) {
				oViewModel.setProperty("/selected", false);
				oViewModel.setProperty("/oneSelected", false);
			} else {
				oViewModel.setProperty("/selected", true);
				oViewModel.setProperty("/oneSelected", false);
			}
		},

		onSelectPlanVersion: function () {
			var sPlanVersionID = this.byId("planVersionsList").getSelectedItem().getBindingContext().getProperty("ID");
			this.getModel("appView").setProperty("/planVersionID", sPlanVersionID);
			this.onClosePlanVersionPress();
		},

		onCreatePlanVersion: function () {
			var oFrag = sap.ui.core.Fragment,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID");
			this._createPlanVersionDialog();

			this.getModel("planVersionView").setProperty("/mode", "create");
			oFrag.byId("planVersionFrag", "snapshotDate").setDateValue(new Date());
			oFrag.byId("planVersionFrag", "version").getBinding("suggestionItems").filter(new Filter("project_ID", FilterOperator.EQ,
				sProjectID));
			oFrag.byId("planVersionFrag", "useCase").setSelectedKey(2);
			oFrag.byId("planVersionFrag", "version").setValue("");
			oFrag.byId("planVersionFrag", "description").setValue("");
			this.oPlanVersionDialog.setTitle(this.getResourceBundle().getText("planVersionCreateTitle"));
			this.oPlanVersionDialog.getButtons()[0].setVisible(true);
			this.oPlanVersionDialog.getButtons()[0].setEnabled(false);
			this.oPlanVersionDialog.getButtons()[1].setVisible(false);

			this.oPlanVersionDialog.open();
		},

		onEditPlanVersion: function () {
			var oFrag = sap.ui.core.Fragment,
				oPlanVersion = this.byId("planVersionsList").getSelectedItem().getBindingContext().getObject();

			this._createPlanVersionDialog();

			this.getModel("planVersionView").setProperty("/mode", "edit");
			this.oPlanVersionDialog.setTitle(this.getResourceBundle().getText("planVersionEditTitle"));
			this.oPlanVersionDialog.getButtons()[1].setVisible(true);
			this.oPlanVersionDialog.getButtons()[1].setEnabled(false);
			this.oPlanVersionDialog.getButtons()[0].setVisible(false);
			this._oPlanVersion = oPlanVersion;
			oFrag.byId("planVersionFrag", "snapshotDate").setDateValue(oPlanVersion.snapshotDate);
			oFrag.byId("planVersionFrag", "version").setValue(oPlanVersion.versionNumber);
			oFrag.byId("planVersionFrag", "description").setValue(oPlanVersion.description);
			oFrag.byId("planVersionFrag", "useCase").setSelectedKey(oPlanVersion.useCase);

			this.oPlanVersionDialog.open();
		},

		onDeletePlanVersion: function () {
			var oModel = this.getModel(),
				oList = this.byId("planVersionsList"),
				aItems = oList.getSelectedItems(),
				sKey;

			MessageBox.confirm(
				this.getResourceBundle().getText("confirmDeletionPlanVersions"), {
					icon: MessageBox.Icon.WARNING,
					title: this.getResourceBundle().getText("confirmDeletion"),
					actions: [sap.m.MessageBox.Action.OK, sap.m.MessageBox.Action.CANCEL],
					initialFocus: MessageBox.Action.CANCEL,
					onClose: function (oAction) {
						if (oAction === "OK") {
							aItems.forEach(function (oItem) {
								sKey = "/" + oModel.createKey("PlanVersions", {
									ID: oItem.getBindingContext().getProperty("ID")
								});
								oModel.remove(sKey, {
									error: function (oError) {
										Log.error("Error deleting plan version");
									}
								});
							});
						}
					}
				});
		},

		onVersionChange: function () {
			this._enableSaveCreate();
		},

		onUseCaseChange: function () {
			this._enableSaveCreate();
		},

		onDescriptionChange: function () {
			this._enableSaveCreate();
		},

		_enableSaveCreate: function () {
			var oFrag = sap.ui.core.Fragment;
			if (oFrag.byId("planVersionFrag", "version").getValue() && oFrag.byId("planVersionFrag", "useCase").getSelectedKey()) {
				// all required fields are filled
				if (this.getModel("planVersionView").getProperty("/mode") === "create") {
					this.oPlanVersionDialog.getButtons()[0].setEnabled(true);
				} else { // edit mode
					if (this._oPlanVersion.versionNumber !== oFrag.byId("planVersionFrag", "version").getValue() ||
						String(this._oPlanVersion.useCase) !== oFrag.byId("planVersionFrag", "useCase").getSelectedKey() ||
						this._oPlanVersion.description !== oFrag.byId("planVersionFrag", "description").getValue()) {
						this.oPlanVersionDialog.getButtons()[1].setEnabled(true);
					} else {
						this.oPlanVersionDialog.getButtons()[1].setEnabled(false);
					}
				}
			} else {
				this.oPlanVersionDialog.getButtons()[0].setEnabled(false);
				this.oPlanVersionDialog.getButtons()[1].setEnabled(false);
			}
		},

		_createPlanVersionDialog: function () {
			var oFrag = sap.ui.core.Fragment,
				oModel = this.getModel(),
				oPlanVersion = {},
				sPlanVersionPath,
				oPlanVersionBC,
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				sCreate = this.getResourceBundle().getText("locationDialogCreateButtonText"),
				sSave = this.getResourceBundle().getText("locationDialogSaveButtonText"),
				sCancel = this.getResourceBundle().getText("locationDialogCancelButtonText"),
				that = this;

			if (!this.oPlanVersionDialog) {
				this.oPlanVersionDialog = new Dialog({
					title: "",
					content: [
						sap.ui.xmlfragment("planVersionFrag", "cockpit.Cockpit.view.AddPlanVersion", this)
					],
					contentWidth: "50%",
					resizable: true,
					draggable: true,
					buttons: [{
						text: sCreate,
						enabled: false,
						visible: true,
						press: function () {
							oPlanVersion.project_ID = sProjectID;
							oPlanVersion.snapshotDate = oFrag.byId("planVersionFrag", "snapshotDate").getDateValue();
							oPlanVersion.versionNumber = oFrag.byId("planVersionFrag", "version").getValue();
							oPlanVersion.useCase = Number(oFrag.byId("planVersionFrag", "useCase").getSelectedKey());
							oPlanVersion.description = oFrag.byId("planVersionFrag", "description").getValue();
							oModel.create("/PlanVersions", oPlanVersion, {
								success: function (oData) {
									MessageToast.show(that.getResourceBundle().getText("creatingSnapshots"));
									// create snapshots
									that.createSnapshot(oData.ID, oPlanVersion.snapshotDate, oPlanVersion.useCase);
								},
								error: function (oError) {
									Log.error("Error creating plan version");
								}
							});
							this.getModel("planVersionView").setProperty("/mode", "");
							that.oPlanVersionDialog.close();
						}
					}, {
						text: sSave,
						enabled: false,
						visible: false,
						press: function () {
							sPlanVersionPath = "/" + oModel.createKey("PlanVersions", {
								ID: that._oPlanVersion.ID
							});
							oPlanVersionBC = oModel.createBindingContext(sPlanVersionPath);
							// project_ID and date cannot be changed
							oModel.setProperty("versionNumber", oFrag.byId("planVersionFrag", "version").getValue(), oPlanVersionBC);
							oModel.setProperty("useCase", Number(oFrag.byId("planVersionFrag", "useCase").getSelectedKey()), oPlanVersionBC);
							oModel.setProperty("description", oFrag.byId("planVersionFrag", "description").getValue(), oPlanVersionBC);
							oModel.submitChanges({
								error: function (oError) {
									Log.error("Error saving plan version changes");
								}
							});
							that.oPlanVersionDialog.close();
							that._oPlanVersion = undefined;
							this.getModel("planVersionView").setProperty("/mode", "");
						}
					}, {
						text: sCancel,
						enabled: true,
						visible: true,
						press: function () {
							that.oPlanVersionDialog.close();
						}
					}]
				});
			}
			this.oPlanVersionDialog.addStyleClass("sapUiContentPadding");
			this.getView().addDependent(this.oPlanVersionDialog);
		},

		createSnapshot: function (sPlanVersionID, oDate, sUseCase) { // revisit: temporarily - must be replaced with a backend function
			var oModel = this.getModel(),
				sProjectID = this.getModel("appView").getProperty("/selectedProjectID"),
				aFilters = [
					new Filter("project_ID", FilterOperator.EQ, sProjectID),
					new Filter("estimatedEnd", FilterOperator.GT, oDate)
				],
				oMaxDate = new Date(oDate),
				sPlanVersionPath = "/" + oModel.createKey("PlanVersions", {
					ID: sPlanVersionID
				}),
				oPlanVersionBC = oModel.createBindingContext(sPlanVersionPath),
				that = this;

			// limit the snapshots to the period given by the plan version type
			switch (sUseCase) {
			case "0": // daily
				oMaxDate.setDate(oMaxDate.getDate() + 1);
				break;
			case "1": // weekly
				oMaxDate.setDate(oMaxDate.getDate() + 7);
				break;
			case "2": // monthly
				oMaxDate.setMonth(oMaxDate.getMonth() + 1);
				break;
			default: // long term
				oMaxDate = undefined;
				break;
			}
			if (oMaxDate) {
				aFilters.push(new Filter("plannedStart", FilterOperator.LT, oMaxDate));
			}

			oModel.read("/Tasks", {
				filters: aFilters,
				and: true,
				success: function (oData) {
					if (oData && oData.results.length > 0) {
						oData.results.reduce(function (a, oTask, i) {
							new Promise(function () {
								var oSnapshotTask = {};
								oSnapshotTask.planVersion_ID = sPlanVersionID;
								oSnapshotTask.location_ID = oTask.location_ID;
								oSnapshotTask.task_ID = oTask.ID;
								oSnapshotTask.shift_ID = oTask.shift_ID;
								oSnapshotTask.plannedStart = oTask.plannedStart;
								oSnapshotTask.plannedEnd = oTask.plannedEnd;
								oSnapshotTask.estimatedEnd = oTask.estimatedEnd;
								oSnapshotTask.actualStart = oTask.actualStart;
								oSnapshotTask.actualEnd = oTask.actualEnd;
								oSnapshotTask.stoppedAt = oTask.stoppedAt;
								oSnapshotTask.stopDuration = oTask.stopDuration;
								oSnapshotTask.waitDuration = oTask.waitDuration;
								oSnapshotTask.status = oTask.status;
								oSnapshotTask.plannedQuantity = oTask.quantity; // the only difference in property name
								oSnapshotTask.actualQuantity = oTask.actualQuantity;
								oSnapshotTask.plannedProductivity = oTask.plannedProductivity;
								oSnapshotTask.productivityFactor = oTask.productivityFactor;
								oSnapshotTask.currentProductivity = oTask.currentProductivity;
								oSnapshotTask.costPlanned = oTask.costPlanned;
								oSnapshotTask.costActual = oTask.costActual;
								oSnapshotTask.costLaborPlanned = oTask.costLaborPlanned;
								oSnapshotTask.costLaborActual = oTask.costLaborActual;
								oSnapshotTask.hoursLaborPlanned = oTask.hoursLaborPlanned;
								oSnapshotTask.hoursLaborActual = oTask.hoursLaborActual;
								oSnapshotTask.costMaterialPlanned = oTask.costMaterialPlanned;
								oSnapshotTask.costMaterialActual = oTask.costMaterialActual;
								oSnapshotTask.costEquipmentPlanned = oTask.costEquipmentPlanned;
								oSnapshotTask.costEquipmentActual = oTask.costEquipmentActual;
								oSnapshotTask.hoursEquipmentPlanned = oTask.hoursEquipmentPlanned;
								oSnapshotTask.hoursEquipmentActual = oTask.hoursEquipmentActual;
								oSnapshotTask.costSubcontractorPlanned = oTask.plannedTotalPrice;
								oSnapshotTask.costSubcontractorActual = oTask.actualTotalPrice;
								oModel.create("/SnapshotTasks", oSnapshotTask, {
									groupId: i,
									success: function (oSnap) {
										Log.info("Snapshot " + i + " of " + oData.results.length + " created");
										if (i === 0) { // last task --> update plan version
											oModel.setProperty("snapshotsComplete", true, oPlanVersionBC);
											oModel.submitChanges({
												success: function () {
													oModel.refresh(); // list was not refreshed
												},
												error: function (oError) {
													Log.error("Error updating plan version after creating snapshots");
												}
											});
										}
									},
									error: function (oError) {
										Log.error("Error creating snapshot of task");
									}
								});
							});
						}, Promise.resolve());
					} else { // if no tasks were found, inform the user and delete the plan version
						MessageBox.error(that.getResourceBundle().getText("noFutureTasks"));
						oModel.remove(sPlanVersionPath, {
							error: function (oError) {
								Log.error("Error deleting plan version after no tasks for snapshot were found");
							}
						});
					}
				},
				error: function (oError) {
					Log.error("Error reading tasks to create a plan version");
				}
			});
		},

		onRecipeSearch: function (oEvent) {
			if (oEvent.getParameters().refreshButtonPressed) {
				// Search field's 'refresh' button has been pressed.
				// This is visible if you select any master list item.
				// In this case no new search is triggered, we only
				// refresh the list binding.
				this.onRefresh();
				return;
			}

			var sQuery = oEvent.getParameter("query");

			if (sQuery) {
				this._oRecipeListFilterState.aSearch = [new Filter("shortText", FilterOperator.Contains, sQuery)];
			} else {
				this._oRecipeListFilterState.aSearch = [];
			}
			this._applyRecipeFilterSearch();
		},

		_applyRecipeFilterSearch: function () {
			var aFilters = this._oRecipeListFilterState.aSearch.concat(this._oRecipeListFilterState.aFilter),
				oViewModel = this.getModel("recipeModel");
			this._oRecipeList.getBinding("items").filter(aFilters, "Application");
			// changes the noDataText of the list in case there are no filter results
			if (aFilters.length !== 0) {
				oViewModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataWithFilterOrSearchText"));
			} else if (this._oRecipeListFilterState.aSearch.length > 0) {
				// only reset the no data text to default when no new search was triggered
				oViewModel.setProperty("/noRecipeDataText", this.getResourceBundle().getText("recipeMasterListNoDataWithFilterOrSearchText"));
			}
		},

		_createViewModel: function () {
			return new JSONModel({
				isFilterBarVisible: false,
				filterBarLabel: "",
				busy: false,
				delay: 0,
				mode: "",
				planVersionTitle: "",
				planVersionsListTitle: "",
				selected: false,
				oneSelected: false,
				sortBy: "",
				groupBy: ""
			});
		},

		onClosePlanVersionPress: function () {
			this.getModel("appView").setProperty("/layout", "TwoColumnsMidExpanded");
			this.getModel("appView").setProperty("/actionButtonsInfo/midColumn/fullScreen", false);
			this.getRouter().navTo("Analytics", {
				projectID: this.getModel("appView").getProperty("/selectedProjectID"),
				locationID: this.getModel("appView").getProperty("/selectedRowIDs")[0]
			}, true);
		},

		/**
		 * Toggle between full and non full screen mode.
		 */
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
		},

		getUseCase: function (oContext) {
			var iUseCase = oContext.getProperty("useCase"),
				oGroup = {
					key: iUseCase
				};
			return oGroup;
		},

		createGroupHeader: function (oGroup) {
			var sText;
			switch (oGroup.key) {
			case 0:
				sText = this.getResourceBundle().getText("dailyPlanVersion");
				break;
			case 1:
				sText = this.getResourceBundle().getText("weeklyPlanVersion");
				break;
			case 2:
				sText = this.getResourceBundle().getText("monthlyPlanVersion");
				break;
			case 3:
				sText = this.getResourceBundle().getText("longTermPlanVersion");
				break;
			default:
				sText = "Error: Unknown type of plan version";
			}
			return new GroupHeaderListItem({
				title: sText,
				upperCase: false
			});
		}

	});

});
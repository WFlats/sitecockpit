sap.ui.define([
	"./BaseController",
	"sap/ui/model/json/JSONModel",
	"sap/ui/model/Filter",
	"sap/m/MessageBox"
], function (BaseController, JSONModel, Filter, MessageBox) {
	"use strict";

	return BaseController.extend("master.data.MasterData.controller.CreateOrgLevel", {

		onInit: function () {
			var oViewModel = new JSONModel({
				busy: true,
				delay: 0,
				mode: "",
				enableSave: false,
				orgLevelID: "",
				orgLevelPath: "",
				viewTitle: ""
			});
			this.setModel(oViewModel, "createOrgLevelView");
			this.getRouter().getTargets().getTarget("CreateOrgLevel").attachDisplay(null, this._onDisplay, this);
		},

		_onDisplay: function (oEvent) {
			var sObjectId = oEvent.getParameter("data").objectId,
				sMode = oEvent.getParameter("data").mode,
				oModel = this.getModel(),
				sObjectPath = "";
			if (sMode === "Edit") {
				sObjectPath = "/" + oModel.createKey("OrganisationLevels", {
					ID: sObjectId
				});
			}
			this.getModel("createOrgLevelView").setProperty("/mode", sMode);
			this.getModel("createOrgLevelView").setProperty("/orgLevelID", sObjectId);
			this.getModel("createOrgLevelView").setProperty("/orgLevelPath", sObjectPath);
			this.getModel().metadataLoaded().then(function () {
				this._bindView(sObjectPath);
			}.bind(this));
		},

		_bindView: function (sObjectPath) {
			// Set busy indicator during view binding
			var oModel = this.getModel(),
				oViewModel = this.getModel("createOrgLevelView");
			// If the view was not bound yet its not busy, only if the binding requests data it is set to busy again
			oViewModel.setProperty("/busy", false);
			if (oViewModel.getProperty("/mode") === "Edit") {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("editOrgLevelViewTitle"));
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
			} else {
				oViewModel.setProperty("/viewTitle", this.getResourceBundle().getText("createOrgLevelViewTitle"));
				var oContext = oModel.createEntry("OrganisationLevels");
				this.getView().setBindingContext(oContext);
			}
		},

		_validateSaveEnablement: function () {
			if (!this.getView().getBindingContext() || this.getView().getBindingContext() === undefined) { // this function gets called again on navback after unbindObject
				return;
			}
			var bSaveEnabled = false,
				sOrgLevel = this.byId("orgLevelID").getValue(),
				sDescription = this.byId("description").getValue();
			this.getModel("createOrgLevelView").setProperty("/enableSave", bSaveEnabled);
			// check if required fields are filled
			if (sOrgLevel === "" || sDescription === "") {
				return;
			}
			if (this.getModel("createOrgLevelView").getProperty("/mode") === "Edit") {
				var oData = this.getView().getBindingContext().getObject({
					select: "*"
				});
				// check if changes were made
				if (oData.orgLevel !== Number(sOrgLevel) || oData.description !== sDescription) {
					bSaveEnabled = true;
				}
			} else {
				bSaveEnabled = true;
			}
			this.getModel("createOrgLevelView").setProperty("/enableSave", bSaveEnabled);
		},

		onSave: function () {
			var oModel = this.getModel(),
				oBC = this.getView().getBindingContext(),
				sOrgLevel = this.byId("orgLevelID").getValue(),
				sDescription = this.byId("description").getValue(),
				that = this;

			this._isCodeUnique(sOrgLevel).then(function (bCodeUnique) {
				var bCanBeSaved = bCodeUnique;
				if (that.getModel("createOrgLevelView").getProperty("/mode") === "Edit" && Number(sOrgLevel) === oModel.getProperty("orgLevel",
						oBC)) {
					bCanBeSaved = true; // if mode = Edit then the same code is valid
				}
				if (!bCanBeSaved) {
					MessageBox.information(
						that.getResourceBundle().getText("orgLevelNotUnique"), {
							id: "codeNotUniqueInfoMessageBox"
								//styleClass: that.getOwnerComponent().getContentDensityClass()
						}
					);
				} else {
					// update oModel
					if (!oModel.setProperty("orgLevel", Number(sOrgLevel), oBC) || !oModel.setProperty("description", sDescription, oBC)) {
						MessageBox.error(that.getResourceBundle().getText("updateError"));
						return;
					}
					if (that.getModel("createOrgLevelView").getProperty("/mode") === "Edit" && !oModel.hasPendingChanges()) {
						MessageBox.information(
							that.getResourceBundle().getText("noChangesMessage"), {
								id: "noChangesInfoMessageBox"
									//styleClass: that.getOwnerComponent().getContentDensityClass()
							}
						);
						return;
					}
					oModel.submitChanges();
					that.getView().unbindObject();
					that.onCancel();
				}
			});
		},

		onDelete: function () {
			var sPath = this.getView().getBindingContext().getPath(),
				oModel = this.getModel(),
				sConfirmTitle = this.getResourceBundle().getText("orgLevelDeleteConfirmationTitle"),
				sConfirmText = this.getResourceBundle().getText("orgLevelDeleteConfirmationText"),
				that = this;

			MessageBox.confirm(
				sConfirmText, {
					icon: MessageBox.Icon.WARNING,
					title: sConfirmTitle,
					actions: [sap.m.MessageBox.Action.YES, sap.m.MessageBox.Action.NO],
					initialFocus: MessageBox.Action.NO,
					onClose: function (sAction) {
						if (sAction === "YES") {
							oModel.remove(sPath);
							that.getView().unbindObject();
							that.onCancel();
						}
					}
				}
			);
		},

		onCancel: function () {
			var oModel = this.getModel();
			this.getModel("createOrgLevelView").setProperty("/enableSave", false);
			if (this.getModel("createOrgLevelView").getProperty("/mode") === "Create") {
				oModel.deleteCreatedEntry(this.getView().getBindingContext());
			}
			this.getView().unbindObject();
			this.getRouter().getTargets().display("OrgLevels");
		},

		_isCodeUnique: function (sCode) {
			var oModel = this.getModel(),
				sPath = "/OrganisationLevels",
				aFilter = [new Filter({
					path: "orgLevel",
					operator: sap.ui.model.FilterOperator.EQ,
					value1: sCode
				})];

			return new Promise(function (resolve, reject) {
				oModel.read(sPath, {
					urlParameters: {
						$inlinecount: "allpages",
						$top: 1
					},
					filters: aFilter,
					success: function (oData) {
						if (oData.results.length > 0) {
							resolve(false);
						} else {
							resolve(true);
						}
					},
					error: function () {
						resolve(false);
					}
				});
			});
		}

	});

});